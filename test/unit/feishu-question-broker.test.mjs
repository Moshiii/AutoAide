import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

function createScheduler() {
  const timers = [];
  return {
    setTimeoutFn: (fn, delay) => {
      const timer = { fn, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: (timer) => {
      timer.cleared = true;
    },
  };
}

test("Feishu question broker publishes a waiting-answer card and resolves text reply", async () => {
  const { QuestionBroker, QuestionDecision } = await importFresh("../../src/runtime/question-broker.mjs");
  const { FeishuQuestionBroker } = await importFresh("../../src/feishu/question-broker.mjs");
  const scheduler = createScheduler();
  const snapshots = [];
  const broker = new QuestionBroker({
    now: () => Date.parse("2026-06-25T08:00:00.000Z"),
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "question_1",
  });
  const feishuBroker = new FeishuQuestionBroker({
    broker,
    userId: "feishu:user_1",
    conversationId: "feishu:chat:oc_1",
    sessionLabel: "main",
    cardController: {
      publish: async (snapshot) => snapshots.push(snapshot),
    },
  });

  const waiting = feishuBroker.waitForAnswer({
    runId: "run_1",
    prompt: "Which file should I edit?",
  });

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].state, "waiting_answer");
  assert.equal(snapshots[0].question.userId, "feishu:user_1");
  assert.equal(snapshots[0].question.conversationId, "feishu:chat:oc_1");
  assert.equal(feishuBroker.findPendingQuestion({
    channel: "feishu",
    conversationId: "feishu:chat:oc_1",
    userId: "feishu:user_1",
  }).questionId, "question_1");

  const resolved = feishuBroker.answerQuestion({
    runId: "run_1",
    questionId: "question_1",
    userId: "feishu:user_1",
    answer: "README.md",
  });

  assert.equal(resolved.ok, true);
  assert.equal((await waiting).decision, QuestionDecision.ANSWERED);
});

test("Feishu question broker surfaces publish failures but still waits", async () => {
  const { QuestionBroker, QuestionDecision } = await importFresh("../../src/runtime/question-broker.mjs");
  const { FeishuQuestionBroker } = await importFresh("../../src/feishu/question-broker.mjs");
  const scheduler = createScheduler();
  const errors = [];
  const broker = new QuestionBroker({
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "question_1",
  });
  const feishuBroker = new FeishuQuestionBroker({
    broker,
    userId: "feishu:user_1",
    conversationId: "feishu:chat:oc_1",
    cardController: {
      publish: async () => {
        throw new Error("card failed");
      },
    },
    onError: (error) => errors.push(error.message),
  });
  const waiting = feishuBroker.waitForAnswer({
    runId: "run_1",
    prompt: "Which file?",
  });
  await Promise.resolve();

  assert.deepEqual(errors, ["card failed"]);

  feishuBroker.answerQuestion({
    runId: "run_1",
    questionId: "question_1",
    userId: "feishu:user_1",
    answer: "README.md",
  });

  assert.equal((await waiting).decision, QuestionDecision.ANSWERED);
});
