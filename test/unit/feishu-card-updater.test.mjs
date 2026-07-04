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
    runNext: async () => {
      const timer = timers.find((entry) => !entry.cleared);
      assert.ok(timer, "expected a scheduled timer");
      timer.cleared = true;
      timer.fn();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

test("Feishu card updater creates then throttles intermediate updates", async () => {
  const { FeishuCardUpdateController } = await importFresh("../../src/feishu/card-updater.mjs");
  const scheduler = createScheduler();
  const sentCards = [];
  const updatedCards = [];

  const controller = new FeishuCardUpdateController({
    chatId: "oc_1",
    throttleMs: 1000,
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    renderCard: (snapshot) => ({ snapshot }),
    sendCard: async (payload) => {
      sentCards.push(payload);
      return { data: { message_id: "om_card" } };
    },
    updateCard: async (payload) => {
      updatedCards.push(payload);
    },
  });

  await controller.publish({ state: "running", summary: "start" });
  await controller.publish({ state: "running", summary: "first" });
  await controller.publish({ state: "running", summary: "second" });

  assert.equal(sentCards.length, 1);
  assert.equal(updatedCards.length, 0);
  assert.equal(scheduler.timers.length, 1);

  await scheduler.runNext();

  assert.equal(updatedCards.length, 1);
  assert.equal(updatedCards[0].messageId, "om_card");
  assert.deepEqual(updatedCards[0].card, {
    snapshot: { state: "running", summary: "second" },
  });
});

test("Feishu card updater flushes final updates immediately", async () => {
  const { FeishuCardUpdateController } = await importFresh("../../src/feishu/card-updater.mjs");
  const scheduler = createScheduler();
  const updatedCards = [];

  const controller = new FeishuCardUpdateController({
    chatId: "oc_1",
    throttleMs: 1000,
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    renderCard: (snapshot) => ({ snapshot }),
    sendCard: async () => ({ data: { message_id: "om_card" } }),
    updateCard: async (payload) => {
      updatedCards.push(payload);
    },
  });

  await controller.publish({ state: "running", summary: "start" });
  await controller.publish({ state: "running", summary: "pending" });
  await controller.publish({ state: "completed", outputText: "Done" }, { final: true });

  assert.equal(updatedCards.length, 1);
  assert.deepEqual(updatedCards[0].card, {
    snapshot: { state: "completed", outputText: "Done" },
  });
});

test("Feishu card updater falls back to text when update fails", async () => {
  const { FeishuCardUpdateController } = await importFresh("../../src/feishu/card-updater.mjs");
  const fallbackTexts = [];
  const errors = [];

  const controller = new FeishuCardUpdateController({
    chatId: "oc_1",
    replyToMessageId: "om_reply",
    renderCard: (snapshot) => ({ snapshot }),
    sendCard: async () => ({ data: { message_id: "om_card" } }),
    updateCard: async () => {
      throw new Error("rate limited");
    },
    sendText: async (payload) => {
      fallbackTexts.push(payload);
    },
    onError: (error) => errors.push(error.message),
  });

  await controller.publish({ state: "running", summary: "start" });
  await controller.publish({ state: "failed", errorText: "Boom" }, { final: true });

  assert.deepEqual(errors, ["rate limited"]);
  assert.deepEqual(fallbackTexts, [{
    chatId: "oc_1",
    replyToMessageId: "om_reply",
    text: "Request failed: Boom",
  }]);
});
