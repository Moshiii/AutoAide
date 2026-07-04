import { randomUUID } from "node:crypto";

export const QuestionDecision = Object.freeze({
  ANSWERED: "answered",
  TIMEOUT: "timeout",
  CANCELLED: "cancelled",
});

export class QuestionBroker {
  constructor({
    defaultTimeoutMs = 300_000,
    now = () => Date.now(),
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    createId = randomUUID,
  } = {}) {
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.createId = createId;
    this.pending = new Map();
  }

  requestQuestion({
    runId,
    questionId = this.createId(),
    userId,
    channel,
    conversationId,
    prompt,
    metadata = {},
    timeoutMs = this.defaultTimeoutMs,
  } = {}) {
    if (!runId) {
      throw new Error("Question request requires runId.");
    }
    if (!userId) {
      throw new Error("Question request requires userId.");
    }
    if (!prompt || !String(prompt).trim()) {
      throw new Error("Question request requires prompt.");
    }

    const key = questionKey(runId, questionId);
    if (this.pending.has(key)) {
      throw new Error(`Question request already pending for ${key}.`);
    }

    const createdAtMs = this.now();
    const expiresAtMs = createdAtMs + timeoutMs;
    const request = {
      runId,
      questionId,
      userId,
      channel: channel || null,
      conversationId: conversationId || null,
      prompt: String(prompt).trim(),
      metadata,
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    };

    let resolveResult;
    const result = new Promise((resolve) => {
      resolveResult = resolve;
    });
    const timer = this.setTimeoutFn(() => {
      this.finish(key, {
        ok: false,
        decision: QuestionDecision.TIMEOUT,
        reason: "question_timeout",
        request,
      });
    }, timeoutMs);

    this.pending.set(key, {
      request,
      result,
      resolve: resolveResult,
      timer,
    });

    return { request, result };
  }

  waitForAnswer(request = {}) {
    if (request.runId && request.questionId && this.getPending(request.runId, request.questionId)) {
      return this.pending.get(questionKey(request.runId, request.questionId)).result;
    }
    return this.requestQuestion(request).result;
  }

  answerQuestion({
    runId,
    questionId,
    userId,
    answer,
  } = {}) {
    const key = questionKey(runId, questionId);
    const entry = this.pending.get(key);
    if (!entry) {
      return { ok: false, reason: "question_not_pending" };
    }
    if (entry.request.userId !== userId) {
      return { ok: false, reason: "unauthorized_user" };
    }
    const normalizedAnswer = String(answer || "").trim();
    if (!normalizedAnswer) {
      return { ok: false, reason: "empty_answer" };
    }

    return this.finish(key, {
      ok: true,
      decision: QuestionDecision.ANSWERED,
      answer: normalizedAnswer,
      request: entry.request,
    });
  }

  cancelQuestion({ runId, questionId, reason = "question_cancelled" } = {}) {
    const key = questionKey(runId, questionId);
    const entry = this.pending.get(key);
    if (!entry) {
      return { ok: false, reason: "question_not_pending" };
    }

    return this.finish(key, {
      ok: false,
      decision: QuestionDecision.CANCELLED,
      reason,
      request: entry.request,
    });
  }

  getPending(runId, questionId) {
    return this.pending.get(questionKey(runId, questionId))?.request || null;
  }

  findPendingQuestion({
    channel,
    conversationId,
    userId,
  } = {}) {
    const matches = [];
    for (const entry of this.pending.values()) {
      const request = entry.request;
      if (channel && request.channel !== channel) {
        continue;
      }
      if (conversationId && request.conversationId !== conversationId) {
        continue;
      }
      if (userId && request.userId !== userId) {
        continue;
      }
      matches.push(request);
    }
    matches.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    return matches[0] || null;
  }

  finish(key, result) {
    const entry = this.pending.get(key);
    if (!entry) {
      return { ok: false, reason: "question_not_pending" };
    }
    this.pending.delete(key);
    this.clearTimeoutFn(entry.timer);
    entry.resolve(result);
    return result;
  }
}

export function questionKey(runId, questionId) {
  return `${runId || ""}:${questionId || ""}`;
}
