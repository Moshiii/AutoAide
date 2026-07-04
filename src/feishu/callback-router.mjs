import { PermissionDecision } from "../permissions/permission-broker.mjs";
import { appendRuntimeAuditEvent } from "../runtime-audit-log.mjs";
import { verifyCallbackAction } from "../security/callback-auth.mjs";

function emitCallbackAudit(event, {
  auditEvent,
  runtimeAudit = false,
  botHome,
  normalized = {},
  reason = "",
} = {}) {
  const appendAudit = typeof auditEvent === "function"
    ? auditEvent
    : runtimeAudit === true ? appendRuntimeAuditEvent : null;
  if (typeof appendAudit !== "function") {
    return;
  }
  void Promise.resolve(appendAudit({
    event,
    level: reason ? "warn" : "info",
    details: {
      runId: normalized.runId || "",
      channel: normalized.channel || "feishu",
      userId: normalized.userId || "",
      actionId: normalized.actionId || "",
      action: normalized.action || "",
      errorCode: reason,
      reason,
      botHome,
    },
  }, botHome)).catch(() => {});
}

export function extractFeishuCardActionValue(event = {}) {
  return (
    event.action?.value ||
    event.event?.action?.value ||
    event.value ||
    event.event?.value ||
    null
  );
}

export function extractFeishuCardActionUserId(event = {}) {
  return (
    event.operator?.open_id ||
    event.operator?.operator_id?.open_id ||
    event.user?.open_id ||
    event.event?.operator?.open_id ||
    event.event?.operator?.operator_id?.open_id ||
    event.event?.user?.open_id ||
    null
  );
}

export function normalizeFeishuCardAction(event = {}) {
  const value = extractFeishuCardActionValue(event);
  if (!value || typeof value !== "object") {
    return { ok: false, reason: "missing_action_value" };
  }

  const action = value.action;
  if (action !== "permission.allow" && action !== "permission.deny") {
    return { ok: false, reason: "unsupported_action", action };
  }

  return {
    ok: true,
    action,
    runId: value.runId || "",
    actionId: value.actionId || "",
    nonce: value.nonce || "",
    signature: value.signature || "",
    userId: value.userId || extractFeishuCardActionUserId(event) || "",
    channel: value.channel || "feishu",
    createdAt: value.createdAt || "",
    expiresAt: value.expiresAt || "",
    payloadHash: value.payloadHash || value.actionHash || "",
  };
}

export function routeFeishuCardAction(event, {
  secret,
  nonceStore,
  permissionBroker,
  expectedPayload,
  allowedUserIds,
  now = Date.now(),
  auditEvent,
  runtimeAudit = false,
  botHome,
} = {}) {
  const normalized = normalizeFeishuCardAction(event);
  if (!normalized.ok) {
    emitCallbackAudit("callback rejected", {
      auditEvent,
      runtimeAudit,
      botHome,
      normalized,
      reason: normalized.reason || "invalid_callback_action",
    });
    return normalized;
  }

  const verified = verifyCallbackAction(normalized, {
    secret,
    nonceStore,
    expectedPayload,
    allowedUserIds,
    now,
  });
  if (!verified.ok) {
    emitCallbackAudit("callback rejected", {
      auditEvent,
      runtimeAudit,
      botHome,
      normalized,
      reason: verified.reason || "callback_verification_failed",
    });
    return verified;
  }

  if (!permissionBroker) {
    emitCallbackAudit("callback rejected", {
      auditEvent,
      runtimeAudit,
      botHome,
      normalized,
      reason: "missing_permission_broker",
    });
    return { ok: false, reason: "missing_permission_broker" };
  }

  const decision = normalized.action === "permission.allow"
    ? PermissionDecision.ALLOW
    : PermissionDecision.DENY;
  const resolved = permissionBroker.resolvePermission({
    runId: normalized.runId,
    actionId: normalized.actionId,
    userId: normalized.userId,
    actionHash: normalized.payloadHash,
    decision,
  });
  if (!resolved.ok && resolved.decision !== PermissionDecision.DENY) {
    emitCallbackAudit("callback rejected", {
      auditEvent,
      runtimeAudit,
      botHome,
      normalized,
      reason: resolved.reason || "permission_resolution_failed",
    });
    return resolved;
  }

  return {
    ok: true,
    decision,
    request: resolved.request,
  };
}
