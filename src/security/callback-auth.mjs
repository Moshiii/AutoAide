import crypto from "node:crypto";

import { normalizeTimeMs } from "./callback-nonce-store.mjs";

const SIGNED_FIELDS = [
  "channel",
  "runId",
  "actionId",
  "userId",
  "nonce",
  "createdAt",
  "expiresAt",
  "payloadHash",
];

export function hashCallbackPayload(payload) {
  return crypto
    .createHash("sha256")
    .update(stableStringify(payload ?? null))
    .digest("hex");
}

export function signCallbackAction(action, secret) {
  assertSecret(secret);
  const canonical = canonicalizeCallbackAction(action);
  return crypto
    .createHmac("sha256", secret)
    .update(stableStringify(canonical))
    .digest("hex");
}

export function attachCallbackSignature(action, secret) {
  const payloadHash = action.payloadHash ?? hashCallbackPayload(action.payload);
  const unsigned = {
    ...action,
    payloadHash,
  };
  return {
    ...unsigned,
    signature: signCallbackAction(unsigned, secret),
  };
}

export function verifyCallbackAction(action, {
  secret,
  now = Date.now(),
  nonceStore,
  expectedPayload,
  allowedUserIds,
} = {}) {
  assertSecret(secret);
  const missing = SIGNED_FIELDS.filter((field) => action?.[field] == null || action?.[field] === "");
  if (missing.length > 0) {
    return { ok: false, reason: "missing_fields", missing };
  }
  if (!action.signature) {
    return { ok: false, reason: "missing_signature" };
  }

  const expiresAtMs = normalizeTimeMs(action.expiresAt);
  const createdAtMs = normalizeTimeMs(action.createdAt);
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(createdAtMs)) {
    return { ok: false, reason: "invalid_timestamp" };
  }
  if (expiresAtMs <= now) {
    return { ok: false, reason: "expired" };
  }
  if (createdAtMs > now + 60_000) {
    return { ok: false, reason: "created_in_future" };
  }

  if (expectedPayload !== undefined) {
    const expectedPayloadHash = hashCallbackPayload(expectedPayload);
    if (action.payloadHash !== expectedPayloadHash) {
      return { ok: false, reason: "payload_hash_mismatch" };
    }
  }

  if (allowedUserIds && !new Set(allowedUserIds).has(action.userId)) {
    return { ok: false, reason: "unauthorized_user" };
  }

  const expected = signCallbackAction(action, secret);
  if (!timingSafeEqualHex(action.signature, expected)) {
    return { ok: false, reason: "invalid_signature" };
  }

  if (nonceStore) {
    const nonceResult = nonceStore.consume(action.nonce, action.expiresAt);
    if (!nonceResult.ok) {
      return nonceResult;
    }
  }

  return {
    ok: true,
    action: canonicalizeCallbackAction(action),
  };
}

export function canonicalizeCallbackAction(action) {
  const canonical = {};
  for (const field of SIGNED_FIELDS) {
    canonical[field] = String(action?.[field] ?? "");
  }
  return canonical;
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function assertSecret(secret) {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("Callback action signing requires a secret with at least 16 characters.");
  }
}

function timingSafeEqualHex(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
