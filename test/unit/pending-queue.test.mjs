import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("pending queue enqueues and dequeues per key in order", async () => {
  const { createPendingQueue } = await importFresh("../../src/runtime/pending-queue.mjs");
  const queue = createPendingQueue({ perKeyLimit: 3 });

  assert.deepEqual(queue.enqueue("session-a", { id: "run_1" }), {
    ok: true,
    item: {
      id: "run_1",
      runId: "run_1",
      enqueuedAt: queue.list("session-a")[0].enqueuedAt,
    },
    position: 1,
    limit: 3,
  });
  queue.enqueue("session-a", { id: "run_2" });
  queue.enqueue("session-b", { id: "run_3" });

  assert.equal(queue.size("session-a"), 2);
  assert.equal(queue.size("session-b"), 1);
  assert.equal(queue.dequeue("session-a").id, "run_1");
  assert.equal(queue.dequeue("session-a").id, "run_2");
  assert.equal(queue.dequeue("session-a"), null);
});

test("pending queue rejects items over per-key limit", async () => {
  const { createPendingQueue } = await importFresh("../../src/runtime/pending-queue.mjs");
  const queue = createPendingQueue({ perKeyLimit: 1 });

  assert.equal(queue.enqueue("session-a", { id: "run_1" }).ok, true);
  assert.deepEqual(queue.enqueue("session-a", { id: "run_2" }), {
    ok: false,
    reason: "queue_full",
    position: 2,
    limit: 1,
  });
});

test("pending queue cancels and replaces pending items", async () => {
  const { createPendingQueue } = await importFresh("../../src/runtime/pending-queue.mjs");
  const queue = createPendingQueue({ perKeyLimit: 3 });

  queue.enqueue("session-a", { id: "run_1" });
  queue.enqueue("session-a", { id: "run_2" });

  assert.equal(queue.cancel("session-a", "run_1").id, "run_1");
  assert.equal(queue.cancel("session-a", "missing"), null);
  assert.deepEqual(queue.list("session-a").map((item) => item.id), ["run_2"]);

  const replaced = queue.replace("session-a", { id: "run_3" });

  assert.equal(replaced.ok, true);
  assert.deepEqual(replaced.removed.map((item) => item.id), ["run_2"]);
  assert.deepEqual(queue.list("session-a").map((item) => item.id), ["run_3"]);
});

test("pending queue rejects empty keys and item ids", async () => {
  const { createPendingQueue } = await importFresh("../../src/runtime/pending-queue.mjs");
  const queue = createPendingQueue();

  assert.throws(() => queue.enqueue("", { id: "run_1" }), /non-empty key/);
  assert.throws(() => queue.enqueue("session-a", {}), /requires id/);
});

test("pending queue read operations do not create empty queue snapshots", async () => {
  const { createPendingQueue } = await importFresh("../../src/runtime/pending-queue.mjs");
  const queue = createPendingQueue();

  assert.equal(queue.size("missing-session"), 0);
  assert.deepEqual(queue.list("missing-session"), []);
  assert.deepEqual(queue.snapshot(), {});
});
