function normalizeMentionName(value) {
  return String(value || "").trim().toLowerCase();
}

function isBotMention(mention, botIdentity = {}) {
  if (!mention) {
    return false;
  }
  if (botIdentity.openId && mention.id?.open_id === botIdentity.openId) {
    return true;
  }
  const mentionName = normalizeMentionName(mention.name);
  return Boolean(mentionName) && botIdentity.mentionNames?.has?.(mentionName);
}

export function parseFeishuTextMessage(content) {
  if (!content) {
    return "";
  }
  try {
    const parsed = JSON.parse(content);
    return String(parsed?.text || "").trim();
  } catch {
    return "";
  }
}

export function hasFeishuExplicitMention(event, botIdentity = {}) {
  if (String(event.message?.chat_type || "").toLowerCase() === "p2p") {
    return true;
  }
  if (!Array.isArray(event.message?.mentions) || event.message.mentions.length === 0) {
    return false;
  }
  return event.message.mentions.some((mention) => isBotMention(mention, botIdentity));
}

export function hasProcessedFeishuMessage(state = {}, messageId) {
  return Array.isArray(state.processedMessageIds) && state.processedMessageIds.includes(messageId);
}

export function rememberProcessedFeishuMessage(state = {}, messageId, limit = 200) {
  return {
    ...state,
    processedMessageIds: [
      ...(Array.isArray(state.processedMessageIds) ? state.processedMessageIds : []).filter((id) => id !== messageId),
      messageId,
    ].slice(-Math.max(1, Number.parseInt(String(limit), 10) || 200)),
  };
}

export function classifyFeishuMessageEvent({
  event,
  routerState,
  botIdentity,
  requireExplicitMention = true,
  normalizeIncomingText = (text) => text,
} = {}) {
  const messageId = event?.message?.message_id;
  const chatId = event?.message?.chat_id;
  if (!messageId || !chatId) {
    return {
      action: "ignore",
      reason: "missing_message_or_chat_id",
      messageId,
      chatId,
      routerState,
    };
  }

  if (hasProcessedFeishuMessage(routerState, messageId)) {
    return {
      action: "ignore",
      reason: "duplicate_message",
      messageId,
      chatId,
      routerState,
    };
  }

  const nextRouterState = rememberProcessedFeishuMessage(routerState, messageId);

  if (String(event.sender?.sender_type || "").toLowerCase() !== "user") {
    return {
      action: "ignore",
      reason: "non_user_sender",
      messageId,
      chatId,
      routerState: nextRouterState,
    };
  }

  if (event.message?.message_type !== "text") {
    return {
      action: "unsupported_payload",
      reason: "unsupported_message_type",
      messageId,
      chatId,
      routerState: nextRouterState,
    };
  }

  const text = parseFeishuTextMessage(event.message?.content);
  const normalizedText = String(normalizeIncomingText(text, event, botIdentity) || "").trim();
  if (!normalizedText) {
    return {
      action: "ignore",
      reason: "empty_text",
      messageId,
      chatId,
      routerState: nextRouterState,
    };
  }

  const explicitlyMentionedBot = hasFeishuExplicitMention(event, botIdentity);
  if (requireExplicitMention && !explicitlyMentionedBot) {
    return {
      action: "ignore",
      reason: "mention_required",
      messageId,
      chatId,
      text: normalizedText,
      explicitlyMentionedBot,
      routerState: nextRouterState,
    };
  }

  return {
    action: "process_text",
    messageId,
    chatId,
    text: normalizedText,
    explicitlyMentionedBot,
    routerState: nextRouterState,
  };
}
