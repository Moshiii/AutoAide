import { FEISHU_CARD_STATE } from "./cards.mjs";
import { renderFeishuRunCard } from "./card-renderer.mjs";

export class FeishuCardUpdateController {
  constructor({
    chatId,
    replyToMessageId,
    throttleMs = 1000,
    renderCard = renderFeishuRunCard,
    sendCard,
    updateCard,
    sendText,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    onResponse = () => {},
    onError = () => {},
  } = {}) {
    this.chatId = chatId;
    this.replyToMessageId = replyToMessageId;
    this.throttleMs = throttleMs;
    this.renderCard = renderCard;
    this.sendCard = sendCard;
    this.updateCard = updateCard;
    this.sendText = sendText;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.onResponse = onResponse;
    this.onError = onError;
    this.messageId = null;
    this.lastUpdateAt = 0;
    this.timer = null;
    this.pending = null;
  }

  async publish(snapshot, { final = false, fallbackText } = {}) {
    this.pending = snapshot;
    if (!this.messageId) {
      await this.create(snapshot, fallbackText);
      return;
    }
    if (final) {
      await this.flush(fallbackText);
      return;
    }

    const now = Date.now();
    const waitMs = Math.max(0, this.throttleMs - (now - this.lastUpdateAt));
    if (waitMs === 0) {
      await this.flush(fallbackText);
      return;
    }
    if (!this.timer) {
      this.timer = this.setTimeoutFn(() => {
        this.timer = null;
        void this.flush(fallbackText);
      }, waitMs);
    }
  }

  async create(snapshot, fallbackText) {
    try {
      const response = await this.sendCard({
        chatId: this.chatId,
        replyToMessageId: this.replyToMessageId,
        card: this.renderCard(snapshot),
      });
      this.onResponse(response);
      this.messageId = extractFeishuMessageId(response);
      this.lastUpdateAt = Date.now();
    } catch (error) {
      this.onError(error);
      await this.fallback(fallbackText || snapshotToText(snapshot));
    }
  }

  async flush(fallbackText) {
    if (!this.pending || !this.messageId) {
      return;
    }
    if (this.timer) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }

    const snapshot = this.pending;
    this.pending = null;
    try {
      await this.updateCard({
        messageId: this.messageId,
        card: this.renderCard(snapshot),
      });
      this.lastUpdateAt = Date.now();
    } catch (error) {
      this.onError(error);
      await this.fallback(fallbackText || snapshotToText(snapshot));
    }
  }

  async fallback(text) {
    if (!this.sendText || !text) {
      return;
    }
    await this.sendText({
      chatId: this.chatId,
      replyToMessageId: this.replyToMessageId,
      text,
    });
  }
}

export function snapshotToText(snapshot = {}) {
  if (snapshot.outputText) {
    return snapshot.outputText;
  }
  if (snapshot.errorText) {
    return `Request failed: ${snapshot.errorText}`;
  }
  if (snapshot.state === FEISHU_CARD_STATE.STOPPED) {
    return "Run stopped.";
  }
  return snapshot.summary || "CodexBridge is working.";
}

export function extractFeishuMessageId(response) {
  return (
    response?.data?.message_id ||
    response?.data?.messageId ||
    response?.message_id ||
    response?.messageId ||
    null
  );
}
