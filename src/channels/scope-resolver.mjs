import { resolveConversationIdentity, resolveSessionKey, resolveSessionLabel } from "../session-routing.mjs";

export function resolveChannelScope(envelope = {}) {
  const identity = resolveConversationIdentity(envelope);
  return {
    ...identity,
    channel: envelope.channel || "",
    chatType: envelope.chatType || (envelope.isDirect ? "direct" : "group"),
    chatId: envelope.chatId || "",
    userId: envelope.userId || "",
    isDirect: Boolean(envelope.isDirect || envelope.chatType === "direct"),
    isGroup: Boolean(envelope.isGroup || envelope.chatType === "group"),
  };
}

export { resolveConversationIdentity, resolveSessionKey, resolveSessionLabel };
