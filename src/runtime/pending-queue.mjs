function normalizeLimit(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeKey(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error("PendingQueue requires a non-empty key.");
  }
  return normalized;
}

function normalizeItem(item = {}) {
  const id = String(item.id || item.runId || "").trim();
  if (!id) {
    throw new Error("PendingQueue item requires id or runId.");
  }
  return {
    ...item,
    id,
    runId: item.runId || id,
    enqueuedAt: item.enqueuedAt || new Date().toISOString(),
  };
}

export function createPendingQueue(options = {}) {
  const perKeyLimit = normalizeLimit(options.perKeyLimit, 3);
  const queues = new Map();

  function getQueue(key) {
    const normalizedKey = normalizeKey(key);
    if (!queues.has(normalizedKey)) {
      queues.set(normalizedKey, []);
    }
    return queues.get(normalizedKey);
  }

  function peekQueue(key) {
    return queues.get(normalizeKey(key)) || [];
  }

  function enqueue(key, item) {
    const queue = getQueue(key);
    if (queue.length >= perKeyLimit) {
      return {
        ok: false,
        reason: "queue_full",
        position: queue.length + 1,
        limit: perKeyLimit,
      };
    }

    const normalized = normalizeItem(item);
    queue.push(normalized);
    return {
      ok: true,
      item: normalized,
      position: queue.length,
      limit: perKeyLimit,
    };
  }

  function dequeue(key) {
    const queue = getQueue(key);
    const item = queue.shift() || null;
    if (queue.length === 0) {
      queues.delete(normalizeKey(key));
    }
    return item;
  }

  function cancel(key, id) {
    const queue = getQueue(key);
    const normalizedId = String(id || "").trim();
    const index = queue.findIndex((item) => item.id === normalizedId || item.runId === normalizedId);
    if (index === -1) {
      return null;
    }
    const [item] = queue.splice(index, 1);
    if (queue.length === 0) {
      queues.delete(normalizeKey(key));
    }
    return item;
  }

  function replace(key, item) {
    const queue = getQueue(key);
    const removed = queue.splice(0, queue.length);
    const result = enqueue(key, item);
    return {
      ...result,
      removed,
    };
  }

  function list(key) {
    return [...peekQueue(key)];
  }

  function size(key) {
    return peekQueue(key).length;
  }

  function snapshot() {
    return Object.fromEntries(Array.from(queues.entries()).map(([key, queue]) => [key, [...queue]]));
  }

  return {
    enqueue,
    dequeue,
    cancel,
    replace,
    list,
    size,
    snapshot,
  };
}
