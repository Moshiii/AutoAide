import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

function createScheduler() {
  const timers = [];
  return {
    timers,
    setTimeoutFn: (fn, delay) => {
      const timer = { fn, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: (timer) => {
      timer.cleared = true;
    },
    fire: (index = 0) => {
      const timer = timers[index];
      assert.ok(timer, "expected timer");
      timer.fn();
    },
  };
}

test("question broker answers a pending question once", async () => {
  const { QuestionBroker, QuestionDecision } = await importFresh("../../src/runtime/question-broker.mjs");
  const scheduler = createScheduler();
  const broker = new QuestionBroker({
    now: () => Date.parse("2026-06-25T08:00:00.000Z"),
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "question_1",
  });

  const { request, result } = broker.requestQuestion({
    runId: "run_1",
    userId: "feishu:user_1",
    channel: "feishu",
    conversationId: "feishu:chat:oc_1",
    prompt: "Which file should I edit?",
  });

  assert.equal(request.questionId, "question_1");
  assert.equal(request.prompt, "Which file should I edit?");
  assert.equal(broker.getPending("run_1", "question_1"), request);

  const answered = broker.answerQuestion({
    runId: "run_1",
    questionId: "question_1",
    userId: "feishu:user_1",
    answer: "README.md",
  });

  assert.equal(answered.ok, true);
  assert.equal(answered.answer, "README.md");
  assert.equal((await result).decision, QuestionDecision.ANSWERED);
  assert.equal(broker.getPending("run_1", "question_1"), null);
  assert.deepEqual(broker.answerQuestion({
    runId: "run_1",
    questionId: "question_1",
    userId: "feishu:user_1",
    answer: "again",
  }), { ok: false, reason: "question_not_pending" });
});

test("question broker rejects unauthorized and empty answers", async () => {
  const { QuestionBroker } = await importFresh("../../src/runtime/question-broker.mjs");
  const scheduler = createScheduler();
  const broker = new QuestionBroker({
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "question_1",
  });
  broker.requestQuestion({
    runId: "run_1",
    userId: "feishu:user_1",
    prompt: "Which file?",
  });

  assert.deepEqual(broker.answerQuestion({
    runId: "run_1",
    questionId: "question_1",
    userId: "feishu:other",
    answer: "README.md",
  }), { ok: false, reason: "unauthorized_user" });

  assert.deepEqual(broker.answerQuestion({
    runId: "run_1",
    questionId: "question_1",
    userId: "feishu:user_1",
    answer: "   ",
  }), { ok: false, reason: "empty_answer" });

  broker.cancelQuestion({ runId: "run_1", questionId: "question_1" });
});

test("question broker times out pending questions", async () => {
  const { QuestionBroker, QuestionDecision } = await importFresh("../../src/runtime/question-broker.mjs");
  const scheduler = createScheduler();
  const broker = new QuestionBroker({
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "question_1",
  });
  const { request, result } = broker.requestQuestion({
    runId: "run_1",
    userId: "feishu:user_1",
    prompt: "Which file?",
    timeoutMs: 50,
  });

  assert.equal(scheduler.timers[0].delay, 50);
  scheduler.fire();

  assert.deepEqual(await result, {
    ok: false,
    decision: QuestionDecision.TIMEOUT,
    reason: "question_timeout",
    request,
  });
  assert.equal(broker.getPending("run_1", "question_1"), null);
});

test("question broker cancels pending questions", async () => {
  const { QuestionBroker, QuestionDecision } = await importFresh("../../src/runtime/question-broker.mjs");
  const scheduler = createScheduler();
  const broker = new QuestionBroker({
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "question_1",
  });
  const { request, result } = broker.requestQuestion({
    runId: "run_1",
    userId: "feishu:user_1",
    prompt: "Which file?",
  });

  const cancelled = broker.cancelQuestion({
    runId: "run_1",
    questionId: "question_1",
    reason: "run_stopped",
  });

  assert.equal(cancelled.ok, false);
  assert.deepEqual(await result, {
    ok: false,
    decision: QuestionDecision.CANCELLED,
    reason: "run_stopped",
    request,
  });
});

test("question broker waitForAnswer reuses an existing pending question", async () => {
  const { QuestionBroker, QuestionDecision } = await importFresh("../../src/runtime/question-broker.mjs");
  const scheduler = createScheduler();
  const broker = new QuestionBroker({
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "question_1",
  });
  broker.requestQuestion({
    runId: "run_1",
    questionId: "question_1",
    userId: "feishu:user_1",
    prompt: "Which file?",
  });
  const waiting = broker.waitForAnswer({
    runId: "run_1",
    questionId: "question_1",
    userId: "feishu:user_1",
    prompt: "Which file?",
  });

  broker.answerQuestion({
    runId: "run_1",
    questionId: "question_1",
    userId: "feishu:user_1",
    answer: "README.md",
  });

  assert.equal((await waiting).decision, QuestionDecision.ANSWERED);
});

test("question broker finds latest pending question by conversation and user", async () => {
  const { QuestionBroker } = await importFresh("../../src/runtime/question-broker.mjs");
  const scheduler = createScheduler();
  let now = Date.parse("2026-06-25T08:00:00.000Z");
  const broker = new QuestionBroker({
    now: () => now,
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
  });
  broker.requestQuestion({
    runId: "run_1",
    questionId: "question_1",
    userId: "feishu:user_1",
    channel: "feishu",
    conversationId: "feishu:chat:oc_1",
    prompt: "First?",
  });
  now += 1000;
  const { request } = broker.requestQuestion({
    runId: "run_2",
    questionId: "question_2",
    userId: "feishu:user_1",
    channel: "feishu",
    conversationId: "feishu:chat:oc_1",
    prompt: "Second?",
  });

  assert.equal(broker.findPendingQuestion({
    channel: "feishu",
    conversationId: "feishu:chat:oc_1",
    userId: "feishu:user_1",
  }), request);
  assert.equal(broker.findPendingQuestion({
    channel: "feishu",
    conversationId: "feishu:chat:oc_1",
    userId: "feishu:other",
  }), null);

  broker.cancelQuestion({ runId: "run_1", questionId: "question_1" });
  broker.cancelQuestion({ runId: "run_2", questionId: "question_2" });
});
