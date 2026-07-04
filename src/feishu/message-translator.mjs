import { normalizeFeishuEnvelope } from "../channels/envelope.mjs";

export function translateFeishuMessageEvent(event, options = {}) {
  return normalizeFeishuEnvelope(event, options);
}
