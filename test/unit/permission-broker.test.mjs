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

test("permission broker allows a matching action once", async () => {
  const { PermissionBroker, PermissionDecision } = await importFresh("../../src/permissions/permission-broker.mjs");
  const scheduler = createScheduler();
  const broker = new PermissionBroker({
    now: () => Date.parse("2026-06-25T08:00:00.000Z"),
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "nonce_1",
  });

  const { request, result } = broker.requestPermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    channel: "feishu",
    payload: { command: "npm test" },
    summary: "Run tests",
  });

  assert.equal(request.nonce, "nonce_1");
  assert.equal(request.summary, "Run tests");
  assert.equal(broker.getPending("run_1", "action_1"), request);

  const resolved = broker.resolvePermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    actionHash: request.actionHash,
    decision: PermissionDecision.ALLOW,
  });

  assert.equal(resolved.ok, true);
  assert.equal((await result).decision, PermissionDecision.ALLOW);
  assert.equal(broker.getPending("run_1", "action_1"), null);

  assert.deepEqual(broker.resolvePermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    actionHash: request.actionHash,
    decision: PermissionDecision.ALLOW,
  }), { ok: false, reason: "permission_not_pending" });
});

test("permission broker denies and reports denied result", async () => {
  const { PermissionBroker, PermissionDecision } = await importFresh("../../src/permissions/permission-broker.mjs");
  const scheduler = createScheduler();
  const broker = new PermissionBroker({
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "nonce_1",
  });
  const { request, result } = broker.requestPermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    payload: { command: "npm test" },
  });

  const resolved = broker.resolvePermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    actionHash: request.actionHash,
    decision: PermissionDecision.DENY,
  });

  assert.equal(resolved.ok, false);
  assert.deepEqual(await result, {
    ok: false,
    decision: PermissionDecision.DENY,
    reason: "permission_denied",
    request,
  });
});

test("permission broker rejects unauthorized users and action hash mismatch", async () => {
  const { PermissionBroker, PermissionDecision } = await importFresh("../../src/permissions/permission-broker.mjs");
  const scheduler = createScheduler();
  const broker = new PermissionBroker({
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "nonce_1",
  });
  const { request } = broker.requestPermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    payload: { command: "npm test" },
  });

  assert.deepEqual(broker.resolvePermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:other",
    actionHash: request.actionHash,
    decision: PermissionDecision.ALLOW,
  }), { ok: false, reason: "unauthorized_user" });

  assert.deepEqual(broker.resolvePermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    actionHash: "wrong",
    decision: PermissionDecision.ALLOW,
  }), { ok: false, reason: "action_hash_mismatch" });

  broker.resolvePermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    actionHash: request.actionHash,
    decision: PermissionDecision.DENY,
  });
});

test("permission broker resolves timeout and clears pending request", async () => {
  const { PermissionBroker, PermissionDecision } = await importFresh("../../src/permissions/permission-broker.mjs");
  const scheduler = createScheduler();
  const broker = new PermissionBroker({
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "nonce_1",
  });

  const { request, result } = broker.requestPermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    timeoutMs: 10,
  });

  assert.equal(scheduler.timers[0].delay, 10);
  scheduler.fire();

  assert.deepEqual(await result, {
    ok: false,
    decision: PermissionDecision.TIMEOUT,
    reason: "permission_timeout",
    request,
  });
  assert.equal(broker.getPending("run_1", "action_1"), null);
});

test("permission broker signs requests for callback verification", async () => {
  const {
    PermissionBroker,
    signPermissionRequestForCallback,
  } = await importFresh("../../src/permissions/permission-broker.mjs");
  const { verifyCallbackAction } = await importFresh("../../src/security/callback-auth.mjs");
  const scheduler = createScheduler();
  const now = Date.parse("2026-06-25T08:00:00.000Z");
  const broker = new PermissionBroker({
    now: () => now,
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "nonce_1",
  });
  const payload = { command: "npm test" };
  const { request } = broker.requestPermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    channel: "feishu",
    payload,
  });

  const signed = signPermissionRequestForCallback(request, "test-secret-with-enough-length");

  assert.equal(verifyCallbackAction(signed, {
    secret: "test-secret-with-enough-length",
    expectedPayload: payload,
    now,
  }).ok, true);
});

test("permission broker waitForPermission reuses an existing pending request", async () => {
  const { PermissionBroker, PermissionDecision } = await importFresh("../../src/permissions/permission-broker.mjs");
  const scheduler = createScheduler();
  const broker = new PermissionBroker({
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    createId: () => "nonce_1",
  });
  const { request } = broker.requestPermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    payload: { command: "npm test" },
  });
  const waiting = broker.waitForPermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    payload: { command: "npm test" },
  });

  broker.resolvePermission({
    runId: "run_1",
    actionId: "action_1",
    userId: "feishu:user_1",
    actionHash: request.actionHash,
    decision: PermissionDecision.ALLOW,
  });

  assert.equal((await waiting).decision, PermissionDecision.ALLOW);
});
