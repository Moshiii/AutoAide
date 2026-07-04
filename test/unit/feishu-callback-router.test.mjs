import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { importFresh, withTempHome } from "../helpers/module.js";

const SECRET = "test-secret-with-enough-length";
const NOW = Date.parse("2026-06-25T08:00:00.000Z");
const FIXTURES = path.resolve("test/fixtures/feishu");

async function readFixture(filename) {
  return JSON.parse(await readFile(path.join(FIXTURES, filename), "utf8"));
}

async function createSignedPermissionAction(action = "permission.allow") {
  const { attachCallbackSignature, hashCallbackPayload } = await importFresh("../../src/security/callback-auth.mjs");
  const payload = { command: "npm test" };
  const value = attachCallbackSignature({
    action,
    channel: "feishu",
    runId: "run_1",
    actionId: "act_1",
    userId: "feishu:user_1",
    nonce: "nonce_1",
    createdAt: "2026-06-25T07:59:00.000Z",
    expiresAt: "2026-06-25T08:05:00.000Z",
    payloadHash: hashCallbackPayload(payload),
  }, SECRET);
  return { value, payload };
}

async function waitForAuditEvents(audit, expectedCount, filter = {}) {
  let events = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    events = await audit.listRuntimeAuditEvents(filter);
    if (events.length >= expectedCount) {
      break;
    }
    await sleep(10);
  }
  return events;
}

test("Feishu callback router normalizes supported card action shapes", async () => {
  const { normalizeFeishuCardAction } = await importFresh("../../src/feishu/callback-router.mjs");
  const allowFixture = await readFixture("card-action-allow.json");
  const denyFixture = await readFixture("card-action-deny.json");

  assert.deepEqual(normalizeFeishuCardAction({
    action: {
      value: {
        action: "permission.allow",
        runId: "run_1",
        actionId: "act_1",
        userId: "feishu:user_1",
        nonce: "nonce_1",
        signature: "sig",
        createdAt: "created",
        expiresAt: "expires",
        payloadHash: "hash",
      },
    },
  }), {
    ok: true,
    action: "permission.allow",
    runId: "run_1",
    actionId: "act_1",
    nonce: "nonce_1",
    signature: "sig",
    userId: "feishu:user_1",
    channel: "feishu",
    createdAt: "created",
    expiresAt: "expires",
    payloadHash: "hash",
  });

  assert.deepEqual(normalizeFeishuCardAction({ action: { value: { action: "unknown" } } }), {
    ok: false,
    reason: "unsupported_action",
    action: "unknown",
  });
  assert.equal(normalizeFeishuCardAction(allowFixture).action, "permission.allow");
  assert.equal(normalizeFeishuCardAction(allowFixture).userId, "feishu:user_1");
  assert.equal(normalizeFeishuCardAction(denyFixture).action, "permission.deny");
  assert.equal(normalizeFeishuCardAction(denyFixture).nonce, "nonce_2");
});

test("Feishu callback router resolves signed permission allow once", async () => {
  const { routeFeishuCardAction } = await importFresh("../../src/feishu/callback-router.mjs");
  const { CallbackNonceStore } = await importFresh("../../src/security/callback-nonce-store.mjs");
  const { PermissionBroker, PermissionDecision } = await importFresh("../../src/permissions/permission-broker.mjs");
  const { value, payload } = await createSignedPermissionAction("permission.allow");
  const nonceStore = new CallbackNonceStore({ now: () => NOW });
  const broker = new PermissionBroker({
    now: () => NOW,
    setTimeoutFn: () => ({ fake: true }),
    clearTimeoutFn: () => {},
    createId: () => "broker_nonce",
  });
  const { request, result } = broker.requestPermission({
    runId: "run_1",
    actionId: "act_1",
    userId: "feishu:user_1",
    payload,
  });

  const routed = routeFeishuCardAction({ action: { value } }, {
    secret: SECRET,
    nonceStore,
    permissionBroker: broker,
    expectedPayload: payload,
    allowedUserIds: ["feishu:user_1"],
    now: NOW,
  });

  assert.equal(routed.ok, true);
  assert.equal(routed.decision, PermissionDecision.ALLOW);
  assert.equal(routed.request, request);
  assert.equal((await result).decision, PermissionDecision.ALLOW);

  const replay = routeFeishuCardAction({ action: { value } }, {
    secret: SECRET,
    nonceStore,
    permissionBroker: broker,
    expectedPayload: payload,
    allowedUserIds: ["feishu:user_1"],
    now: NOW,
  });
  assert.deepEqual(replay, { ok: false, reason: "nonce_replay" });
});

test("Feishu callback router resolves signed permission deny", async () => {
  const { routeFeishuCardAction } = await importFresh("../../src/feishu/callback-router.mjs");
  const { PermissionBroker, PermissionDecision } = await importFresh("../../src/permissions/permission-broker.mjs");
  const { value, payload } = await createSignedPermissionAction("permission.deny");
  const broker = new PermissionBroker({
    now: () => NOW,
    setTimeoutFn: () => ({ fake: true }),
    clearTimeoutFn: () => {},
    createId: () => "broker_nonce",
  });
  const { result } = broker.requestPermission({
    runId: "run_1",
    actionId: "act_1",
    userId: "feishu:user_1",
    payload,
  });

  const routed = routeFeishuCardAction({ action: { value } }, {
    secret: SECRET,
    permissionBroker: broker,
    expectedPayload: payload,
    now: NOW,
  });

  assert.equal(routed.ok, true);
  assert.equal(routed.decision, PermissionDecision.DENY);
  assert.equal((await result).reason, "permission_denied");
});

test("Feishu callback router rejects tampered or unauthorized actions", async () => {
  const { routeFeishuCardAction } = await importFresh("../../src/feishu/callback-router.mjs");
  const { PermissionBroker } = await importFresh("../../src/permissions/permission-broker.mjs");
  const { value, payload } = await createSignedPermissionAction("permission.allow");
  const broker = new PermissionBroker({
    setTimeoutFn: () => ({ fake: true }),
    clearTimeoutFn: () => {},
  });

  assert.deepEqual(routeFeishuCardAction({ action: { value: { ...value, actionId: "changed" } } }, {
    secret: SECRET,
    permissionBroker: broker,
    expectedPayload: payload,
    now: NOW,
  }), { ok: false, reason: "invalid_signature" });

  assert.deepEqual(routeFeishuCardAction({ action: { value } }, {
    secret: SECRET,
    permissionBroker: broker,
    expectedPayload: payload,
    allowedUserIds: ["feishu:other"],
    now: NOW,
  }), { ok: false, reason: "unauthorized_user" });
});

test("Feishu callback router audits rejected callbacks", async () => {
  await withTempHome(async () => {
    const { routeFeishuCardAction } = await importFresh("../../src/feishu/callback-router.mjs");
    const { PermissionBroker } = await importFresh("../../src/permissions/permission-broker.mjs");
    const audit = await importFresh("../../src/runtime-audit-log.mjs");
    const { value, payload } = await createSignedPermissionAction("permission.allow");
    const broker = new PermissionBroker({
      setTimeoutFn: () => ({ fake: true }),
      clearTimeoutFn: () => {},
    });

    const routed = routeFeishuCardAction({ action: { value: { ...value, actionId: "changed" } } }, {
      secret: SECRET,
      permissionBroker: broker,
      expectedPayload: payload,
      now: NOW,
      runtimeAudit: true,
    });
    const events = await waitForAuditEvents(audit, 1, { event: "callback rejected" });

    assert.deepEqual(routed, { ok: false, reason: "invalid_signature" });
    assert.equal(events.length, 1);
    assert.equal(events[0].runId, "run_1");
    assert.equal(events[0].channel, "feishu");
    assert.equal(events[0].userId, "feishu:user_1");
    assert.equal(events[0].actionId, "changed");
    assert.equal(events[0].action, "permission.allow");
    assert.equal(events[0].errorCode, "invalid_signature");
    assert.equal("payload" in events[0], false);
    assert.equal("signature" in events[0], false);
  });
});

test("Feishu callback router accepts permission values rendered into cards", async () => {
  const { renderFeishuCardForAgentEvent } = await importFresh("../../src/feishu/card-renderer.mjs");
  const { routeFeishuCardAction } = await importFresh("../../src/feishu/callback-router.mjs");
  const {
    PermissionBroker,
    PermissionDecision,
    signPermissionRequestForCallback,
  } = await importFresh("../../src/permissions/permission-broker.mjs");
  const payload = { command: "npm test" };
  const broker = new PermissionBroker({
    now: () => NOW,
    setTimeoutFn: () => ({ fake: true }),
    clearTimeoutFn: () => {},
    createId: () => "nonce_1",
  });
  const { request, result } = broker.requestPermission({
    runId: "run_1",
    actionId: "act_1",
    userId: "feishu:user_1",
    channel: "feishu",
    payload,
  });
  const signedPermission = {
    ...request,
    ...signPermissionRequestForCallback(request, SECRET),
  };
  const card = renderFeishuCardForAgentEvent({
    type: "permission.requested",
    payload: { permission: signedPermission },
  });
  const allowValue = card.elements.at(-1).actions[0].value;

  const routed = routeFeishuCardAction({ action: { value: allowValue } }, {
    secret: SECRET,
    permissionBroker: broker,
    expectedPayload: payload,
    now: NOW,
  });

  assert.equal(routed.ok, true);
  assert.equal(routed.decision, PermissionDecision.ALLOW);
  assert.equal((await result).decision, PermissionDecision.ALLOW);
});
