function normalizeKey(value, label = "key") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`ActiveRuns requires a non-empty ${label}.`);
  }
  return normalized;
}

function normalizeActive(routeKey, active = {}) {
  const key = normalizeKey(routeKey, "route key");
  const runId = String(active.runId || active.id || "").trim();
  const normalized = active && typeof active === "object" ? active : {};
  normalized.routeKey = key;
  normalized.runId = runId || null;
  normalized.status = normalized.status || "running";
  normalized.startedAt = normalized.startedAt || new Date().toISOString();
  normalized.stopRequested = Boolean(normalized.stopRequested);
  normalized.stopReason = normalized.stopReason || "";
  return normalized;
}

export function createActiveRuns(options = {}) {
  const byRouteKey = options.byRouteKey || new Map();
  const byRunId = options.byRunId || new Map();

  function set(routeKey, active = {}) {
    const normalized = normalizeActive(routeKey, active);
    const previous = byRouteKey.get(normalized.routeKey);
    if (previous?.runId) {
      byRunId.delete(previous.runId);
    }
    byRouteKey.set(normalized.routeKey, normalized);
    if (normalized.runId) {
      byRunId.set(normalized.runId, normalized.routeKey);
    }
    return normalized;
  }

  function has(routeKey) {
    return byRouteKey.has(normalizeKey(routeKey, "route key"));
  }

  function get(routeKey) {
    return byRouteKey.get(normalizeKey(routeKey, "route key")) || null;
  }

  function getByRunId(runId) {
    const normalizedRunId = normalizeKey(runId, "run id");
    const routeKey = byRunId.get(normalizedRunId);
    return routeKey ? byRouteKey.get(routeKey) || null : null;
  }

  function clear(routeKey, expected = null) {
    const key = normalizeKey(routeKey, "route key");
    const current = byRouteKey.get(key);
    if (!current) {
      return false;
    }
    if (expected && current !== expected) {
      return false;
    }
    byRouteKey.delete(key);
    if (current.runId) {
      byRunId.delete(current.runId);
    }
    return true;
  }

  function requestStop(routeOrRunId, reason = "user_stop") {
    const raw = normalizeKey(routeOrRunId, "route key or run id");
    const active = byRouteKey.get(raw) || getByRunId(raw);
    if (!active) {
      return null;
    }
    active.stopRequested = true;
    active.stopReason = reason || "user_stop";
    active.status = "stopping";
    return active;
  }

  function list() {
    return Array.from(byRouteKey.values());
  }

  function snapshot() {
    return Object.fromEntries(byRouteKey.entries());
  }

  return {
    set,
    has,
    get,
    getByRunId,
    clear,
    requestStop,
    list,
    snapshot,
  };
}
