import { randomUUID } from "node:crypto";

import { attachCallbackSignature, hashCallbackPayload } from "../security/callback-auth.mjs";

export const PermissionDecision = Object.freeze({
  ALLOW: "allow",
  DENY: "deny",
  TIMEOUT: "timeout",
});

export class PermissionBroker {
  constructor({
    defaultTimeoutMs = 60_000,
    now = () => Date.now(),
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    createId = randomUUID,
  } = {}) {
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.createId = createId;
    this.pending = new Map();
  }

  requestPermission({
    runId,
    actionId = this.createId(),
    userId,
    channel,
    payload,
    summary,
    timeoutMs = this.defaultTimeoutMs,
  } = {}) {
    if (!runId) {
      throw new Error("Permission request requires runId.");
    }
    if (!userId) {
      throw new Error("Permission request requires userId.");
    }

    const key = permissionKey(runId, actionId);
    if (this.pending.has(key)) {
      throw new Error(`Permission request already pending for ${key}.`);
    }

    const createdAtMs = this.now();
    const expiresAtMs = createdAtMs + timeoutMs;
    const request = {
      runId,
      actionId,
      userId,
      channel: channel || null,
      nonce: this.createId(),
      summary: summary || "Approval requested.",
      payload: payload ?? null,
      actionHash: hashCallbackPayload(payload ?? null),
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    };

    let resolveResult;
    const result = new Promise((resolve) => {
      resolveResult = resolve;
    });
    const timer = this.setTimeoutFn(() => {
      this.finish(key, {
        ok: false,
        decision: PermissionDecision.TIMEOUT,
        reason: "permission_timeout",
        request,
      });
    }, timeoutMs);

    this.pending.set(key, {
      request,
      result,
      resolve: resolveResult,
      timer,
    });

    return { request, result };
  }

  waitForPermission(request = {}) {
    if (request.runId && request.actionId && this.getPending(request.runId, request.actionId)) {
      return this.pending.get(permissionKey(request.runId, request.actionId)).result;
    }
    return this.requestPermission(request).result;
  }

  resolvePermission({
    runId,
    actionId,
    userId,
    actionHash,
    decision,
  } = {}) {
    const key = permissionKey(runId, actionId);
    const entry = this.pending.get(key);
    if (!entry) {
      return { ok: false, reason: "permission_not_pending" };
    }
    if (entry.request.userId !== userId) {
      return { ok: false, reason: "unauthorized_user" };
    }
    if (entry.request.actionHash !== actionHash) {
      return { ok: false, reason: "action_hash_mismatch" };
    }
    if (decision !== PermissionDecision.ALLOW && decision !== PermissionDecision.DENY) {
      return { ok: false, reason: "invalid_decision" };
    }

    return this.finish(key, {
      ok: decision === PermissionDecision.ALLOW,
      decision,
      reason: decision === PermissionDecision.DENY ? "permission_denied" : null,
      request: entry.request,
    });
  }

  getPending(runId, actionId) {
    return this.pending.get(permissionKey(runId, actionId))?.request || null;
  }

  finish(key, result) {
    const entry = this.pending.get(key);
    if (!entry) {
      return { ok: false, reason: "permission_not_pending" };
    }
    this.pending.delete(key);
    this.clearTimeoutFn(entry.timer);
    entry.resolve(result);
    return result;
  }
}

export function permissionKey(runId, actionId) {
  return `${runId || ""}:${actionId || ""}`;
}

export function signPermissionRequestForCallback(request, secret) {
  return attachCallbackSignature({
    channel: request.channel || "feishu",
    runId: request.runId,
    actionId: request.actionId,
    userId: request.userId,
    nonce: request.nonce,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    payloadHash: request.actionHash,
  }, secret);
}
