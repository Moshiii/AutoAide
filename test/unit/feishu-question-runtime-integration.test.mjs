import test from "node:test";
import assert from "node:assert/strict";

import { importFresh, withTempHome } from "../helpers/module.js";

const NOW = Date.parse("2026-06-25T08:00:00.000Z");

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

test("Feishu question runtime completes after same-user text reply", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    const { QuestionBroker } = await importFresh("../../src/runtime/question-broker.mjs");
    const { FeishuQuestionBroker } = await importFresh("../../src/feishu/question-broker.mjs");
    const scheduler = createScheduler();
    const snapshots = [];
    const broker = new QuestionBroker({
      now: () => NOW,
      setTimeoutFn: scheduler.setTimeoutFn,
      clearTimeoutFn: scheduler.clearTimeoutFn,
      createId: () => "question_1",
    });
    const feishuBroker = new FeishuQuestionBroker({
      broker,
      userId: "feishu:user_1",
      conversationId: "feishu:chat:oc_1",
      cardController: {
        publish: async (snapshot) => {
          snapshots.push(snapshot);
        },
      },
    });

    const runPromise = executeRun({
      record: {
        userId: "feishu:user_1",
        channel: "feishu",
      },
      questionBroker: feishuBroker,
    }, {
      agentAdapter: {
        async runTurn(_request, handlers) {
          handlers.onEvent({
            type: "question.requested",
            payload: {
              question: {
                prompt: "Which file should I edit?",
              },
            },
          });
          return {
            ok: true,
            output: "continued after answer",
          };
        },
      },
    });
    for (let attempt = 0; attempt < 20 && snapshots.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].state, "waiting_answer");

    const pending = feishuBroker.findPendingQuestion({
      channel: "feishu",
      conversationId: "feishu:chat:oc_1",
      userId: "feishu:user_1",
    });
    assert.equal(pending.questionId, "question_1");

    const answered = feishuBroker.answerQuestion({
      runId: pending.runId,
      questionId: pending.questionId,
      userId: "feishu:user_1",
      answer: "README.md",
    });
    assert.equal(answered.ok, true);

    const result = await runPromise;
    assert.equal(result.run.status, "completed");
    assert.equal(result.run.outputPreview, "continued after answer");
  });
});
