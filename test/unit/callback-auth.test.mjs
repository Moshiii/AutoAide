import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { importFresh, withTempHome } from "../helpers/module.js";

const SECRET = "test-secret-with-enough-length";
const NOW = Date.parse("2026-06-25T08:00:00.000Z");

function baseAction(overrides = {}) {
  return {
    channel: "feishu",
    runId: "run_1",
    actionId: "allow_shell_1",
    userId: "feishu:user_1",
    nonce: "nonce_1",
    createdAt: "2026-06-25T07:59:00.000Z",
    expiresAt: "2026-06-25T08:05:00.000Z",
    payload: {
      command: "npm test",
      cwd: "workspace/project",
    },
    ...overrides,
  };
}

test("callback auth signs and verifies a valid action once", async () => {
  const { attachCallbackSignature, verifyCallbackAction } = await importFresh("../../src/security/callback-auth.mjs");
  const { CallbackNonceStore } = await importFresh("../../src/security/callback-nonce-store.mjs");
  const nonceStore = new CallbackNonceStore({ now: () => NOW });
  const action = attachCallbackSignature(baseAction(), SECRET);

  const result = verifyCallbackAction(action, {
    secret: SECRET,
    now: NOW,
    nonceStore,
    expectedPayload: baseAction().payload,
    allowedUserIds: ["feishu:user_1"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.action, {
    channel: "feishu",
    runId: "run_1",
    actionId: "allow_shell_1",
    userId: "feishu:user_1",
    nonce: "nonce_1",
    createdAt: "2026-06-25T07:59:00.000Z",
    expiresAt: "2026-06-25T08:05:00.000Z",
    payloadHash: action.payloadHash,
  });
});

test("callback auth rejects replayed nonces", async () => {
  const { attachCallbackSignature, verifyCallbackAction } = await importFresh("../../src/security/callback-auth.mjs");
  const { CallbackNonceStore } = await importFresh("../../src/security/callback-nonce-store.mjs");
  const nonceStore = new CallbackNonceStore({ now: () => NOW });
  const action = attachCallbackSignature(baseAction(), SECRET);

  assert.equal(verifyCallbackAction(action, { secret: SECRET, now: NOW, nonceStore }).ok, true);

  const replay = verifyCallbackAction(action, { secret: SECRET, now: NOW, nonceStore });
  assert.deepEqual(replay, { ok: false, reason: "nonce_replay" });
});

test("callback auth rejects tampered payloads and signatures", async () => {
  const { attachCallbackSignature, verifyCallbackAction } = await importFresh("../../src/security/callback-auth.mjs");
  const action = attachCallbackSignature(baseAction(), SECRET);

  const tamperedPayload = verifyCallbackAction(action, {
    secret: SECRET,
    now: NOW,
    expectedPayload: { command: "rm -rf ..", cwd: "workspace/project" },
  });
  assert.deepEqual(tamperedPayload, { ok: false, reason: "payload_hash_mismatch" });

  const tamperedSignature = verifyCallbackAction({ ...action, actionId: "different" }, {
    secret: SECRET,
    now: NOW,
  });
  assert.deepEqual(tamperedSignature, { ok: false, reason: "invalid_signature" });
});

test("callback auth rejects expired and unauthorized actions", async () => {
  const { attachCallbackSignature, verifyCallbackAction } = await importFresh("../../src/security/callback-auth.mjs");
  const expiredAction = attachCallbackSignature(baseAction({
    expiresAt: "2026-06-25T07:59:59.000Z",
  }), SECRET);
  const validAction = attachCallbackSignature(baseAction(), SECRET);

  assert.deepEqual(verifyCallbackAction(expiredAction, {
    secret: SECRET,
    now: NOW,
  }), { ok: false, reason: "expired" });

  assert.deepEqual(verifyCallbackAction(validAction, {
    secret: SECRET,
    now: NOW,
    allowedUserIds: ["feishu:other_user"],
  }), { ok: false, reason: "unauthorized_user" });
});

test("persistent callback nonce store rejects replays after reload and prunes expired entries", async () => {
  const { attachCallbackSignature, verifyCallbackAction } = await importFresh("../../src/security/callback-auth.mjs");
  const { PersistentCallbackNonceStore } = await importFresh("../../src/security/callback-nonce-store.mjs");

  await withTempHome(async (tempHome) => {
    const filePath = path.join(tempHome, "callback-nonces.json");
    const action = attachCallbackSignature(baseAction(), SECRET);
    const firstStore = new PersistentCallbackNonceStore({ filePath, now: () => NOW });

    assert.equal(verifyCallbackAction(action, {
      secret: SECRET,
      now: NOW,
      nonceStore: firstStore,
    }).ok, true);

    const reloadedStore = new PersistentCallbackNonceStore({ filePath, now: () => NOW });
    assert.deepEqual(verifyCallbackAction(action, {
      secret: SECRET,
      now: NOW,
      nonceStore: reloadedStore,
    }), { ok: false, reason: "nonce_replay" });

    const prunedStore = new PersistentCallbackNonceStore({
      filePath,
      now: () => Date.parse("2026-06-25T08:06:00.000Z"),
    });
    assert.equal(prunedStore.has("nonce_1"), false);
  });
});
