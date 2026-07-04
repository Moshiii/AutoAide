import { chargeRequestUsage, renderBillingDeniedMessage } from "../billing-service.mjs";
import { markRunDenied } from "../run-service.mjs";

function normalizeString(value) {
  return String(value || "").trim();
}

export function buildBillingChargeRequest({
  user = {},
  run = {},
  chatType,
  amount,
  botHome,
  channel,
  chatId,
  messageId,
} = {}) {
  return {
    userId: user.id || run.userId || "",
    chatType: normalizeString(chatType || run.chatType || "group") || "group",
    amount,
    botHome,
    channel: normalizeString(channel || run.channel),
    chatId: normalizeString(chatId || run.chatId),
    messageId: normalizeString(messageId || run.messageId),
    runId: normalizeString(run.runId),
  };
}

export async function chargeRunBilling({
  user = {},
  run = {},
  chatType,
  amount,
  botHome,
  channel,
  chatId,
  messageId,
  chargeUsage = chargeRequestUsage,
  denyRun = markRunDenied,
  renderDeniedMessage = renderBillingDeniedMessage,
} = {}) {
  const chargeRequest = buildBillingChargeRequest({
    user,
    run,
    chatType,
    amount,
    botHome,
    channel,
    chatId,
    messageId,
  });
  const charge = await chargeUsage(chargeRequest);
  if (!charge.ok) {
    const deniedRun = await denyRun(chargeRequest.runId, "insufficient_credits", {}, botHome);
    return {
      ok: false,
      decision: "denied",
      reason: "insufficient_credits",
      message: renderDeniedMessage(charge, { userId: chargeRequest.userId }),
      user,
      run: deniedRun,
      charged: charge,
      chargeRequest,
    };
  }
  return {
    ok: true,
    decision: "ready",
    reason: "",
    message: "",
    user,
    run,
    charged: charge,
    chargeRequest,
  };
}
