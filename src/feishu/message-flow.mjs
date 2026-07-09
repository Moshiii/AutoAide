import { normalizeFeishuEnvelope } from "../channels/envelope.mjs";
import { prepareChatRequest } from "../chat-request-service.mjs";
import { appendConversationLogEvent } from "../conversation-log.mjs";
import { buildUserId } from "../users-state.mjs";
import { classifyFeishuMessageEvent } from "./event-gateway.mjs";
import {
  ensureFeishuCliSession,
  ensureFeishuConversationState,
  readFeishuRouterState,
  writeFeishuRouterState,
} from "./router-state.mjs";
import { runPreparedFeishuCodexTurn } from "./prepared-runner.mjs";
import { FEISHU_TYPING_REACTION } from "./client.mjs";

export function renderFeishuUnsupportedPayloadMessage() {
  return [
    "I can handle plain text messages here right now.",
    "For document work, send a text request or a Feishu doc link first.",
    "File attachment download/upload and generated Feishu document delivery must be enabled by the operator before attachments can be processed directly.",
  ].join("\n");
}

export function renderFeishuRequestFailedMessage(errorText = "") {
  const detail = String(errorText || "").trim();
  return [
    "The request failed before CodexBridge could return an answer.",
    detail ? `Detail: ${detail}` : null,
    "Paid credits charged for this request are refunded automatically; daily free quota does not spend paid credits.",
    "Try again later. If this keeps happening, ask the operator to check the runtime log.",
  ].filter(Boolean).join("\n");
}

export function renderFeishuRunningMessage(sessionLabel, hasSessionRef) {
  return `Running ${hasSessionRef ? "Codex resume" : "Codex"} on [${sessionLabel}]...`;
}

export function buildFeishuPrompt(text, event = {}) {
  const cleaned = String(text || "").trim();
  if (!cleaned) {
    return "";
  }
  if (event.message?.chat_type === "p2p") {
    return cleaned;
  }
  const senderOpenId = event.sender?.sender_id?.open_id || "unknown";
  return [
    "This is a Feishu group chat message that explicitly @mentioned you.",
    `Sender open_id: ${senderOpenId}`,
    "Respond naturally to the sender's actual request in the shared conversation.",
    "Do not rewrite the user's message as a template or suggest what others should say unless the user explicitly asks for copywriting help.",
    "",
    `User request: ${cleaned}`,
  ].join("\n");
}

function getFeishuUserDisplayName(event = {}) {
  const sender = event.sender || {};
  return (
    sender.sender_id?.union_id ||
    sender.sender_id?.open_id ||
    sender.sender_id?.user_id ||
    ""
  );
}

function rememberBotOpenId(botIdentity, response) {
  const openId = response?.data?.sender?.sender_id?.open_id || response?.sender?.sender_id?.open_id;
  if (openId && botIdentity) {
    botIdentity.openId = openId;
  }
}

async function appendLogSafely(appendLog, payload, botHome) {
  try {
    await appendLog(payload, botHome);
  } catch {
    // Conversation logging should not break the user-visible Feishu flow.
  }
}

async function addRunningReactionSafely(sendReaction, messageId) {
  if (typeof sendReaction !== "function" || !messageId) {
    return;
  }
  try {
    await sendReaction({
      messageId,
      emojiType: FEISHU_TYPING_REACTION,
    });
  } catch {
    // A missing reaction scope should not prevent the final assistant reply.
  }
}

export async function handleFeishuTextMessageFlow({
  event,
  botHome,
  routerStatePath,
  botIdentity = {},
  requireExplicitMention = true,
  normalizeIncomingText = (text) => text,
  commandConfig = {},
  activeRuns = new Map(),
  sendText,
  sendReaction,
  deps = {},
} = {}) {
  if (typeof sendText !== "function") {
    throw new Error("Feishu message flow requires sendText.");
  }
  const readRouterState = deps.readRouterState || readFeishuRouterState;
  const writeRouterState = deps.writeRouterState || writeFeishuRouterState;
  const prepareRequest = deps.prepareChatRequest || prepareChatRequest;
  const runPrepared = deps.runPreparedFeishuCodexTurn || runPreparedFeishuCodexTurn;
  const ensureSession = deps.ensureSession || ensureFeishuCliSession;
  const appendLog = deps.appendConversationLogEvent || appendConversationLogEvent;
  const routerState = await readRouterState(routerStatePath);
  const decision = classifyFeishuMessageEvent({
    event,
    routerState,
    botIdentity,
    requireExplicitMention,
    normalizeIncomingText,
  });

  if (decision.reason === "duplicate_message") {
    return { action: "ignored", reason: "duplicate_message" };
  }
  if (decision.routerState && decision.routerState !== routerState) {
    routerState.processedMessageIds = decision.routerState.processedMessageIds;
  }
  await writeRouterState(routerStatePath, routerState);

  if (decision.action === "ignore") {
    return { action: "ignored", reason: decision.reason };
  }

  const chatId = decision.chatId || event?.message?.chat_id || "";
  const messageId = decision.messageId || event?.message?.message_id || "";
  if (decision.action === "unsupported_payload") {
    const response = await sendText({
      chatId,
      replyToMessageId: messageId,
      text: renderFeishuUnsupportedPayloadMessage(),
    });
    rememberBotOpenId(botIdentity, response);
    return { action: "unsupported_payload", response };
  }

  if (decision.action !== "process_text") {
    return { action: "ignored", reason: "unsupported_decision" };
  }

  const envelope = normalizeFeishuEnvelope(event, {
    text: decision.text,
    explicitlyMentionedBot: decision.explicitlyMentionedBot,
  });
  const usageUserId = buildUserId("feishu", envelope.userId);
  const chatState = ensureFeishuConversationState(routerState, envelope);
  const routeKey = chatState.sessionKey || chatState.sessionLabel;
  chatState.updatedAt = new Date().toISOString();
  await ensureSession(botHome, chatState);
  await writeRouterState(routerStatePath, routerState);

  const promptText = buildFeishuPrompt(decision.text, event);
  if (!promptText) {
    return { action: "ignored", reason: "empty_prompt" };
  }

  const preparedRequest = await prepareRequest({
    channel: "feishu",
    externalUserId: envelope.userId,
    displayName: getFeishuUserDisplayName(event),
    envelope,
    chatId,
    messageId,
    conversationId: envelope.conversationId,
    content: promptText,
    botHome,
  });

  if (!preparedRequest.ok) {
    await appendLogSafely(appendLog, {
      runId: preparedRequest.run?.runId,
      userId: preparedRequest.user?.id,
      channel: envelope.channel,
      chatType: envelope.chatType,
      chatId,
      messageId,
      conversationId: envelope.conversationId,
      direction: "output",
      content: preparedRequest.message,
      metadata: {
        decision: preparedRequest.decision,
        reason: preparedRequest.reason,
        policy: preparedRequest.policy,
      },
    }, botHome);
    const response = await sendText({
      chatId,
      replyToMessageId: messageId,
      text: preparedRequest.message,
    });
    rememberBotOpenId(botIdentity, response);
    return { action: "denied", preparedRequest, response };
  }

  const runRecord = preparedRequest.run;
  const chargeResult = preparedRequest.charged;
  await appendLogSafely(appendLog, {
    runId: runRecord.runId,
    userId: runRecord.userId,
    channel: envelope.channel,
    chatType: envelope.chatType,
    chatId,
    messageId,
    conversationId: envelope.conversationId,
    direction: "input",
    content: promptText,
    metadata: {
      costSource: chargeResult?.costSource,
      creditsCharged: chargeResult?.charged,
      policy: preparedRequest.policy,
    },
  }, botHome);

  const result = await runPrepared({
    runRecord,
    chargeResult,
    promptText,
    botHome,
    chatState,
    routeKey,
    commandConfig,
    activeRuns,
    envelope,
    chatId,
    messageId,
    onRunning: async () => {
      await addRunningReactionSafely(sendReaction, messageId);
    },
  });

  const latestState = await readRouterState(routerStatePath);
  const latestChatState = ensureFeishuConversationState(latestState, envelope);
  if (result.ok && result.cliSessionRef) {
    latestChatState.cliSessionRef = result.cliSessionRef;
  }
  latestChatState.updatedAt = new Date().toISOString();
  await writeRouterState(routerStatePath, latestState);
  await ensureSession(botHome, latestChatState);

  const outputText = result.ok ? result.outputText || "Done." : renderFeishuRequestFailedMessage(result.errorText);
  await appendLogSafely(appendLog, {
    runId: runRecord.runId,
    userId: runRecord.userId,
    channel: envelope.channel,
    chatType: envelope.chatType,
    chatId,
    messageId,
    conversationId: envelope.conversationId,
    direction: "output",
    content: outputText,
    metadata: {
      ok: Boolean(result.ok),
      stopped: Boolean(result.stopped),
    },
  }, botHome);
  const response = await sendText({
    chatId,
    replyToMessageId: messageId,
    text: outputText,
  });
  rememberBotOpenId(botIdentity, response);

  return {
    action: result.ok ? "completed" : "failed",
    envelope,
    preparedRequest,
    result,
    response,
    usageUserId,
  };
}
