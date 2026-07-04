import { createPendingQueue } from "./pending-queue.mjs";
import { createActiveRuns } from "./active-runs.mjs";

function normalizeKey(value) {
  const key = String(value || "").trim();
  if (!key) {
    throw new Error("RunCoordinator requires a non-empty route key.");
  }
  return key;
}

function createActiveRunRegistry(activeRuns) {
  if (!activeRuns) {
    return createActiveRuns();
  }
  if (activeRuns instanceof Map) {
    return createActiveRuns({ byRouteKey: activeRuns });
  }
  return activeRuns;
}

export function createRunCoordinator(options = {}) {
  const activeRuns = createActiveRunRegistry(options.activeRuns);
  const queue = options.queue || createPendingQueue({ perKeyLimit: options.perKeyLimit ?? 3 });
  const queueEnabled = Boolean(options.queueEnabled);

  function isActive(routeKey) {
    return activeRuns.has(normalizeKey(routeKey));
  }

  function getActive(routeKey) {
    return activeRuns.get(normalizeKey(routeKey));
  }

  function setActive(routeKey, active) {
    return activeRuns.set(normalizeKey(routeKey), active);
  }

  function clearActive(routeKey, active = null) {
    return activeRuns.clear(normalizeKey(routeKey), active);
  }

  function getActiveByRunId(runId) {
    return activeRuns.getByRunId(runId);
  }

  function requestStop(routeOrRunId, reason = "user_stop") {
    return activeRuns.requestStop(routeOrRunId, reason);
  }

  function submit(routeKey, item) {
    const key = normalizeKey(routeKey);
    if (!activeRuns.has(key)) {
      return {
        ok: true,
        status: "ready",
        routeKey: key,
        item,
      };
    }

    if (!queueEnabled) {
      return {
        ok: false,
        status: "busy",
        routeKey: key,
        reason: "running_session",
      };
    }

    const enqueued = queue.enqueue(key, item);
    return {
      ...enqueued,
      status: enqueued.ok ? "queued" : "rejected",
      routeKey: key,
    };
  }

  function next(routeKey) {
    return queue.dequeue(normalizeKey(routeKey));
  }

  function cancel(routeKey, id) {
    return queue.cancel(normalizeKey(routeKey), id);
  }

  function pendingCount(routeKey) {
    return queue.size(normalizeKey(routeKey));
  }

  return {
    isActive,
    getActive,
    setActive,
    clearActive,
    getActiveByRunId,
    requestStop,
    submit,
    next,
    cancel,
    pendingCount,
    activeSnapshot: activeRuns.snapshot,
    snapshot: queue.snapshot,
  };
}
