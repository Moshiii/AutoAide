import { requestChildStop, terminateChildProcess } from "../pid-files.mjs";

function normalizeKey(value, label = "key") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`ProcessPool requires a non-empty ${label}.`);
  }
  return normalized;
}

function normalizeEntry(key, child, metadata = {}) {
  if (!child || typeof child !== "object") {
    throw new Error("ProcessPool requires a child process handle.");
  }
  return {
    key,
    child,
    pid: child.pid || null,
    runId: metadata.runId || "",
    sessionKey: metadata.sessionKey || "",
    routeKey: metadata.routeKey || "",
    channel: metadata.channel || "",
    startedAt: metadata.startedAt || new Date().toISOString(),
    metadata: {
      ...(metadata.metadata || {}),
    },
  };
}

export function createProcessPool(options = {}) {
  const processes = options.processes || new Map();
  const stopChild = options.requestChildStop || requestChildStop;
  const terminateChild = options.terminateChildProcess || terminateChildProcess;

  function register(key, child, metadata = {}) {
    const normalizedKey = normalizeKey(key);
    const previous = processes.get(normalizedKey);
    if (previous?.child && previous.child !== child) {
      stopChild(previous.child, { reason: "replaced" });
    }
    const entry = normalizeEntry(normalizedKey, child, metadata);
    processes.set(normalizedKey, entry);
    return entry;
  }

  function get(key) {
    return processes.get(normalizeKey(key)) || null;
  }

  function unregister(key, child = null) {
    const normalizedKey = normalizeKey(key);
    const entry = processes.get(normalizedKey);
    if (!entry) {
      return false;
    }
    if (child && entry.child !== child) {
      return false;
    }
    return processes.delete(normalizedKey);
  }

  function requestStop(key, reason = "user_stop", stopOptions = {}) {
    const entry = get(key);
    if (!entry) {
      return {
        ok: false,
        stopped: false,
        reason: "process_not_found",
      };
    }
    const stopped = stopChild(entry.child, {
      reason,
      ...stopOptions,
    });
    return {
      ok: stopped,
      stopped,
      reason: stopped ? reason : "process_not_stoppable",
      entry,
    };
  }

  async function terminate(key, terminateOptions = {}) {
    const entry = get(key);
    if (!entry) {
      return {
        ok: false,
        terminated: false,
        reason: "process_not_found",
      };
    }
    const terminated = await terminateChild(entry.child, terminateOptions);
    if (terminated) {
      processes.delete(entry.key);
    }
    return {
      ok: terminated,
      terminated,
      reason: terminated ? "terminated" : "process_not_terminated",
      entry,
    };
  }

  function list(filter = {}) {
    return Array.from(processes.values())
      .filter((entry) => !filter.runId || entry.runId === filter.runId)
      .filter((entry) => !filter.sessionKey || entry.sessionKey === filter.sessionKey)
      .filter((entry) => !filter.routeKey || entry.routeKey === filter.routeKey)
      .filter((entry) => !filter.channel || entry.channel === filter.channel)
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  function snapshot() {
    return list().map((entry) => ({
      key: entry.key,
      pid: entry.pid,
      runId: entry.runId,
      sessionKey: entry.sessionKey,
      routeKey: entry.routeKey,
      channel: entry.channel,
      startedAt: entry.startedAt,
      metadata: entry.metadata,
    }));
  }

  return {
    register,
    get,
    unregister,
    requestStop,
    terminate,
    list,
    snapshot,
  };
}
