import { canUseCapability, createRunPolicy } from "../policy/run-policy.mjs";

const ACTION_CAPABILITIES = Object.freeze({
  "shell.exec": "shell",
  "command.exec": "shell",
  "file.write": "write",
  "file.delete": "write",
  "network.fetch": "network",
  "http.request": "network",
  "git.push": "git",
  "git.commit": "git",
  "git.checkout": "git",
  "mcp.call": "mcp",
  "external.message.send": "external_message",
});

const HIGH_RISK_ACTIONS = new Set([
  "shell.exec",
  "command.exec",
  "file.delete",
  "git.push",
  "mcp.call",
  "external.message.send",
]);

function normalizeAction(action) {
  return String(action || "").trim().toLowerCase();
}

function resolveCapability(action) {
  return ACTION_CAPABILITIES[action] || action.split(".")[0] || "unknown";
}

export function classifyToolAction(action, payload = {}) {
  const normalizedAction = normalizeAction(action);
  const capability = resolveCapability(normalizedAction);
  const writes = capability === "write" || Boolean(payload.writes || payload.writePath || payload.deletePath);
  const network = capability === "network" || Boolean(payload.network);
  const shell = capability === "shell";
  const highRisk = HIGH_RISK_ACTIONS.has(normalizedAction) || shell || (writes && network);
  const risk = highRisk ? "high" : writes || network ? "medium" : "low";
  return {
    action: normalizedAction,
    capability,
    risk,
    writes,
    network,
    shell,
  };
}

export function canUseToolCapability(policy = createRunPolicy(), capability = "") {
  const normalized = String(capability || "").trim().toLowerCase();
  if (normalized === "write") {
    return Boolean(policy.allowWrite);
  }
  if (normalized === "external_message") {
    return Boolean(policy.allowExternalMessage);
  }
  return canUseCapability(policy, normalized);
}

export function evaluateToolPermission({ action, payload = {}, policy = createRunPolicy(), requireApprovalForHighRisk = true } = {}) {
  const classified = classifyToolAction(action, payload);
  if (!classified.action) {
    return {
      ok: false,
      decision: "deny",
      reason: "missing_action",
      ...classified,
    };
  }

  const allowed = canUseToolCapability(policy, classified.capability);
  if (!allowed) {
    return {
      ok: false,
      decision: "deny",
      reason: `capability_denied:${classified.capability}`,
      ...classified,
    };
  }

  if (requireApprovalForHighRisk && classified.risk === "high") {
    return {
      ok: false,
      decision: "approval_required",
      reason: "high_risk_action",
      ...classified,
    };
  }

  return {
    ok: true,
    decision: "allow",
    reason: "",
    ...classified,
  };
}

export function buildToolPermissionRequest({ runId = "", action, payload = {}, policy = createRunPolicy() } = {}) {
  const evaluation = evaluateToolPermission({ action, payload, policy });
  return {
    runId,
    actionId: payload.actionId || `${normalizeAction(action) || "action"}:${runId || "pending"}`,
    action: normalizeAction(action),
    summary: payload.summary || `${normalizeAction(action)} requires approval`,
    payload,
    evaluation,
    risk: evaluation.risk,
    capability: evaluation.capability,
  };
}
