import { resolveBotHome } from "./config.mjs";
import { createQueuedRun, markRunDenied } from "./run-service.mjs";
import { evaluateConversationPolicy } from "./conversation-policy.mjs";
import { chargeRunBilling } from "./permissions/billing-gate.mjs";
import { appendRuntimeAuditEvent } from "./runtime-audit-log.mjs";
import {
  buildUserId,
  canUseGroupChat,
  canUsePrivateChat,
  renderBannedUserMessage,
  renderPrivateChatLockedMessage,
  upsertUser,
} from "./users-state.mjs";

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeChatType(chatType) {
  const normalized = normalizeString(chatType).toLowerCase();
  return normalized === "group" ? "group" : "direct";
}

function isDirectChat(chatType, isDirect) {
  return Boolean(isDirect || normalizeChatType(chatType) === "direct");
}

function buildVisibility(chatType, isDirect) {
  return isDirectChat(chatType, isDirect) ? "private" : "public";
}

function emitChatRequestAudit(event, {
  auditEvent,
  runtimeAudit = false,
  botHome,
  run = {},
  user = {},
  details = {},
} = {}) {
  const appendAudit = typeof auditEvent === "function"
    ? auditEvent
    : runtimeAudit === true ? appendRuntimeAuditEvent : null;
  if (typeof appendAudit !== "function") {
    return;
  }
  const nextDetails = {
    runId: run.runId || details.runId || "",
    channel: run.channel || details.channel || "",
    userId: user.id || run.userId || details.userId || "",
    chatId: run.chatId || details.chatId || "",
    botHome,
    errorCode: details.errorCode || "",
    ...details,
  };
  void Promise.resolve(appendAudit({
    event,
    level: nextDetails.errorCode ? "warn" : "info",
    details: nextDetails,
  }, botHome)).catch(() => {});
}

function canUserAccessChat(user, chatType, isDirect) {
  return isDirectChat(chatType, isDirect) ? canUsePrivateChat(user) : canUseGroupChat(user);
}

function accessDeniedReason(user, chatType, isDirect) {
  if (user?.status === "banned") {
    return "user_banned";
  }
  if (isDirectChat(chatType, isDirect)) {
    return "private_chat_locked";
  }
  return "chat_access_denied";
}

function accessDeniedMessage(user, chatType, isDirect) {
  if (user?.status === "banned") {
    return renderBannedUserMessage();
  }
  if (isDirectChat(chatType, isDirect)) {
    return renderPrivateChatLockedMessage(user);
  }
  return "This user cannot use CodexBridge in this chat.";
}

async function chargePreparedRun({
  user,
  run,
  chatType,
  amount,
  botHome,
  channel,
  chatId,
  messageId,
} = {}) {
  return await chargeRunBilling({
    user,
    run,
    chatType,
    amount,
    botHome,
    channel,
    chatId,
    messageId,
  });
}

export async function prepareChatRequest({
  channel,
  externalUserId,
  displayName = "",
  envelope = {},
  chatId = "",
  messageId = "",
  conversationId = "",
  content = "",
  amount,
  deferCharge = false,
  botHome = resolveBotHome(),
  auditEvent,
  runtimeAudit = false,
} = {}) {
  const normalizedChannel = normalizeString(channel || envelope.channel).toLowerCase();
  const normalizedExternalUserId = normalizeString(externalUserId || envelope.userId);
  const chatType = normalizeChatType(envelope.chatType);
  const isDirect = Boolean(envelope.isDirect);
  const user = await upsertUser({
    id: buildUserId(normalizedChannel, normalizedExternalUserId),
    channel: normalizedChannel,
    externalUserId: normalizedExternalUserId,
    displayName,
  }, botHome);

  const runFields = {
    userId: user.id,
    conversationId: normalizeString(conversationId || envelope.conversationId),
    channel: normalizedChannel,
    chatType,
    chatId: normalizeString(chatId || envelope.chatId),
    messageId: normalizeString(messageId || envelope.messageId),
    visibility: buildVisibility(chatType, isDirect),
  };

  const run = await createQueuedRun(runFields, botHome);
  const policy = evaluateConversationPolicy(content);
  if (policy.action === "block") {
    const deniedRun = await markRunDenied(run.runId, "conversation_policy_blocked", {
      reason: policy.reason,
    }, botHome);
    emitChatRequestAudit("policy denied", {
      auditEvent,
      runtimeAudit,
      botHome,
      run: deniedRun,
      user,
      details: {
        errorCode: "conversation_policy_blocked",
        reason: policy.reason,
        policyAction: policy.action,
        blockingLabels: policy.blockingLabels || [],
      },
    });
    return {
      ok: false,
      decision: "denied",
      reason: "conversation_policy_blocked",
      message: policy.userMessage,
      user,
      run: deniedRun,
      charged: null,
      policy,
    };
  }

  if (!canUserAccessChat(user, chatType, isDirect)) {
    const reason = accessDeniedReason(user, chatType, isDirect);
    const deniedRun = await markRunDenied(run.runId, reason, {}, botHome);
    emitChatRequestAudit("policy denied", {
      auditEvent,
      runtimeAudit,
      botHome,
      run: deniedRun,
      user,
      details: {
        errorCode: reason,
        reason,
        policyAction: "deny_access",
      },
    });
    return {
      ok: false,
      decision: "denied",
      reason,
      message: accessDeniedMessage(user, chatType, isDirect),
      user,
      run: deniedRun,
      charged: null,
      policy,
    };
  }

  if (deferCharge) {
    return {
      ok: true,
      decision: "pending_charge",
      reason: "",
      message: "",
      user,
      run,
      charged: null,
      policy,
      chargeRequest: {
        userId: user.id,
        chatType,
        amount,
        botHome,
        channel: normalizedChannel,
        chatId: runFields.chatId,
        messageId: runFields.messageId,
        runId: run.runId,
      },
    };
  }

  const charged = await chargePreparedRun({
    user,
    run,
    chatType,
    amount,
    botHome,
    channel: normalizedChannel,
    chatId: runFields.chatId,
    messageId: runFields.messageId,
  });
  charged.policy = policy;
  emitChatRequestAudit(charged.ok ? "billing charged" : "billing denied", {
    auditEvent,
    runtimeAudit,
    botHome,
    run: charged.run,
    user,
    details: {
      errorCode: charged.ok ? "" : charged.reason || "billing_denied",
      reason: charged.reason || "",
      costSource: charged.charged?.costSource || "",
      charged: charged.charged?.charged ?? charged.charged?.paidCreditsCharged ?? 0,
    },
  });
  return charged;
}

export async function chargePreparedChatRequest(prepared = {}, {
  amount,
  botHome = prepared.chargeRequest?.botHome || resolveBotHome(),
} = {}) {
  if (!prepared?.ok || !prepared?.run?.runId || !prepared?.user?.id) {
    throw new Error("chargePreparedChatRequest requires a successful prepared chat request.");
  }
  if (prepared.charged) {
    return {
      ...prepared,
      decision: "ready",
    };
  }
  const chargeRequest = prepared.chargeRequest || {};
  const charged = await chargePreparedRun({
    user: prepared.user,
    run: prepared.run,
    chatType: chargeRequest.chatType || prepared.run.chatType,
    amount: amount ?? chargeRequest.amount,
    botHome,
    channel: chargeRequest.channel || prepared.run.channel,
    chatId: chargeRequest.chatId || prepared.run.chatId,
    messageId: chargeRequest.messageId || prepared.run.messageId,
  });
  return {
    ...prepared,
    ...charged,
    policy: prepared.policy,
  };
}
