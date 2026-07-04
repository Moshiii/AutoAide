import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("billing gate builds a stable charge request from user and run context", async () => {
  const { buildBillingChargeRequest } = await importFresh("../../src/permissions/billing-gate.mjs");

  const request = buildBillingChargeRequest({
    user: { id: "telegram:1" },
    run: {
      runId: " run_1 ",
      channel: " telegram ",
      chatType: "group",
      chatId: " -100 ",
      messageId: " m1 ",
    },
    amount: 2,
    botHome: "/tmp/bot",
  });

  assert.deepEqual(request, {
    userId: "telegram:1",
    chatType: "group",
    amount: 2,
    botHome: "/tmp/bot",
    channel: "telegram",
    chatId: "-100",
    messageId: "m1",
    runId: "run_1",
  });
});

test("billing gate returns ready when charge succeeds", async () => {
  const { chargeRunBilling } = await importFresh("../../src/permissions/billing-gate.mjs");
  const calls = [];
  const run = { runId: "run_1", channel: "telegram", chatType: "group" };
  const user = { id: "telegram:1" };

  const result = await chargeRunBilling({
    user,
    run,
    chargeUsage: async (request) => {
      calls.push(request);
      return { ok: true, costSource: "daily_free", charged: 1 };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.decision, "ready");
  assert.equal(result.run, run);
  assert.equal(result.user, user);
  assert.equal(result.charged.costSource, "daily_free");
  assert.equal(calls[0].runId, "run_1");
});

test("billing gate marks run denied when charge fails", async () => {
  const { chargeRunBilling } = await importFresh("../../src/permissions/billing-gate.mjs");
  const denied = [];

  const result = await chargeRunBilling({
    user: { id: "telegram:1" },
    run: { runId: "run_denied", channel: "telegram", chatType: "group" },
    botHome: "/tmp/bot",
    chargeUsage: async () => ({ ok: false, reason: "empty_balance" }),
    denyRun: async (runId, reason, details, botHome) => {
      denied.push({ runId, reason, details, botHome });
      return { runId, status: "denied", reason };
    },
    renderDeniedMessage: (charge, { userId }) => `${userId}:${charge.reason}`,
  });

  assert.equal(result.ok, false);
  assert.equal(result.decision, "denied");
  assert.equal(result.reason, "insufficient_credits");
  assert.equal(result.message, "telegram:1:empty_balance");
  assert.deepEqual(denied, [{
    runId: "run_denied",
    reason: "insufficient_credits",
    details: {},
    botHome: "/tmp/bot",
  }]);
});
