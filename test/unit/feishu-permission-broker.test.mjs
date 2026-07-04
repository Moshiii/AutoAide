import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

const SECRET = "test-secret-with-enough-length";

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

test("Feishu permission broker publishes signed approval card and resolves allow", async () => {
  const { PermissionBroker, PermissionDecision } = await importFresh("../../src/permissions/permission-broker.mjs");
  const { FeishuPermissionBroker } = await importFresh("../../src/permissions/feishu-permission-broker.mjs");
  const scheduler = createScheduler();
  const snapshots = [];
  const broker = new PermissionBroker({
    now: () => Date.parse("2026-06-25T08:00:00.000Z"),
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "nonce_1",
  });
  const feishuBroker = new FeishuPermissionBroker({
    broker,
    signingSecret: SECRET,
    sessionLabel: "main",
    cardController: {
      publish: async (snapshot) => snapshots.push(snapshot),
    },
  });
  const waiting = feishuBroker.waitForPermission({
    runId: "run_1",
    actionId: "act_1",
    userId: "feishu:user_1",
    channel: "feishu",
    payload: { command: "npm test" },
    summary: "Run tests",
  });

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].state, "waiting_permission");
  assert.equal(snapshots[0].permission.signature.length > 0, true);
  assert.equal(snapshots[0].permission.payloadHash, snapshots[0].permission.actionHash);

  const resolved = feishuBroker.resolvePermission({
    runId: "run_1",
    actionId: "act_1",
    userId: "feishu:user_1",
    actionHash: snapshots[0].permission.actionHash,
    decision: PermissionDecision.ALLOW,
  });

  assert.equal(resolved.ok, true);
  assert.equal((await waiting).decision, PermissionDecision.ALLOW);
});

test("Feishu permission broker surfaces publish failures but still waits", async () => {
  const { PermissionBroker, PermissionDecision } = await importFresh("../../src/permissions/permission-broker.mjs");
  const { FeishuPermissionBroker } = await importFresh("../../src/permissions/feishu-permission-broker.mjs");
  const scheduler = createScheduler();
  const errors = [];
  const broker = new PermissionBroker({
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "nonce_1",
  });
  const feishuBroker = new FeishuPermissionBroker({
    broker,
    signingSecret: SECRET,
    cardController: {
      publish: async () => {
        throw new Error("card failed");
      },
    },
    onError: (error) => errors.push(error.message),
  });
  const waiting = feishuBroker.waitForPermission({
    runId: "run_1",
    actionId: "act_1",
    userId: "feishu:user_1",
    payload: { command: "npm test" },
  });
  await Promise.resolve();
  const request = broker.getPending("run_1", "act_1");

  assert.deepEqual(errors, ["card failed"]);

  feishuBroker.resolvePermission({
    runId: "run_1",
    actionId: "act_1",
    userId: "feishu:user_1",
    actionHash: request.actionHash,
    decision: PermissionDecision.DENY,
  });

  assert.equal((await waiting).decision, PermissionDecision.DENY);
});
