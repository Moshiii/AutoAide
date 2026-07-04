import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("run coordinator preserves busy rejection when queue is disabled", async () => {
  const { createRunCoordinator } = await importFresh("../../src/runtime/run-coordinator.mjs");
  const coordinator = createRunCoordinator({ queueEnabled: false });

  assert.equal(coordinator.submit("session-a", { id: "run_1" }).status, "ready");
  coordinator.setActive("session-a", { pid: 123 });

  assert.deepEqual(coordinator.submit("session-a", { id: "run_2" }), {
    ok: false,
    status: "busy",
    routeKey: "session-a",
    reason: "running_session",
  });
});

test("run coordinator queues requests when queue is enabled", async () => {
  const { createRunCoordinator } = await importFresh("../../src/runtime/run-coordinator.mjs");
  const coordinator = createRunCoordinator({ queueEnabled: true, perKeyLimit: 2 });

  coordinator.setActive("session-a", { pid: 123 });
  const queued = coordinator.submit("session-a", { id: "run_2" });

  assert.equal(queued.ok, true);
  assert.equal(queued.status, "queued");
  assert.equal(queued.position, 1);
  assert.equal(coordinator.pendingCount("session-a"), 1);
  assert.equal(coordinator.next("session-a").id, "run_2");
  assert.equal(coordinator.pendingCount("session-a"), 0);
});

test("run coordinator clears active run only when expected handle matches", async () => {
  const { createRunCoordinator } = await importFresh("../../src/runtime/run-coordinator.mjs");
  const coordinator = createRunCoordinator();
  const active = { pid: 123 };

  coordinator.setActive("session-a", active);

  assert.equal(coordinator.clearActive("session-a", { pid: 999 }), false);
  assert.equal(coordinator.isActive("session-a"), true);
  assert.equal(coordinator.clearActive("session-a", active), true);
  assert.equal(coordinator.isActive("session-a"), false);
});

test("run coordinator indexes and stops active runs by run id", async () => {
  const { createRunCoordinator } = await importFresh("../../src/runtime/run-coordinator.mjs");
  const coordinator = createRunCoordinator();

  const active = coordinator.setActive("session-a", {
    runId: "run_1",
    pid: 123,
  });

  assert.equal(coordinator.getActiveByRunId("run_1"), active);
  assert.equal(coordinator.requestStop("run_1", "operator_stop"), active);
  assert.equal(active.stopRequested, true);
  assert.equal(active.stopReason, "operator_stop");
  assert.deepEqual(Object.keys(coordinator.activeSnapshot()), ["session-a"]);
});

test("run coordinator accepts legacy Map activeRuns backing store", async () => {
  const { createRunCoordinator } = await importFresh("../../src/runtime/run-coordinator.mjs");
  const activeRuns = new Map();
  const coordinator = createRunCoordinator({ activeRuns });

  const active = coordinator.setActive("session-a", { runId: "run_1" });

  assert.equal(activeRuns.get("session-a"), active);
  assert.equal(coordinator.clearActive("session-a", active), true);
  assert.equal(activeRuns.has("session-a"), false);
});
