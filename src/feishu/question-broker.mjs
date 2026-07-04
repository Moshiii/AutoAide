import { FEISHU_CARD_STATE } from "./cards.mjs";

export class FeishuQuestionBroker {
  constructor({
    broker,
    cardController,
    channel = "feishu",
    userId,
    conversationId,
    sessionLabel,
    title = "CodexBridge",
    onError = () => {},
  } = {}) {
    if (!broker || typeof broker.requestQuestion !== "function") {
      throw new Error("FeishuQuestionBroker requires a QuestionBroker.");
    }
    if (!cardController || typeof cardController.publish !== "function") {
      throw new Error("FeishuQuestionBroker requires a cardController.");
    }
    this.broker = broker;
    this.cardController = cardController;
    this.channel = channel;
    this.userId = userId;
    this.conversationId = conversationId;
    this.sessionLabel = sessionLabel;
    this.title = title;
    this.onError = onError;
  }

  async waitForAnswer(request = {}) {
    const { request: pendingRequest, result } = this.broker.requestQuestion({
      ...request,
      channel: request.channel || this.channel,
      userId: request.userId || this.userId,
      conversationId: request.conversationId || this.conversationId,
    });

    try {
      await this.cardController.publish({
        state: FEISHU_CARD_STATE.WAITING_ANSWER,
        title: this.title,
        sessionLabel: this.sessionLabel,
        summary: pendingRequest.prompt,
        question: pendingRequest,
      }, {
        fallbackText: `CodexBridge needs your reply: ${pendingRequest.prompt}`,
      });
    } catch (error) {
      this.onError(error);
    }

    return await result;
  }

  answerQuestion(payload) {
    return this.broker.answerQuestion(payload);
  }

  findPendingQuestion(payload) {
    return this.broker.findPendingQuestion(payload);
  }

  getPending(runId, questionId) {
    return this.broker.getPending(runId, questionId);
  }
}
