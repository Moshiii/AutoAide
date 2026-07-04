import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("active runs indexes running handles by route key and run id", async () => {
  const { createActiveRuns } = await importFresh("../../src/runtime/active-runs.mjs");
  const activeRuns = createActiveRuns();

  const active = activeRuns.set("session-a", {
    runId: "run_1",
    pid: 123,
  });

  assert.equal(active.routeKey, "session-a");
  assert.equal(active.runId, "run_1");
  assert.equal(active.status, "running");
  assert.equal(activeRuns.has("session-a"), true);
  assert.equal(activeRuns.get("session-a"), active);
  assert.equal(activeRuns.getByRunId("run_1"), active);
  assert.deepEqual(activeRuns.list(), [active]);
});

test("active runs replaces stale run id indexes", async () => {
  const { createActiveRuns } = await importFresh("../../src/runtime/active-runs.mjs");
  const activeRuns = createActiveRuns();

  activeRuns.set("session-a", { runId: "run_1" });
  const replacement = activeRuns.set("session-a", { runId: "run_2" });

  assert.equal(activeRuns.getByRunId("run_1"), null);
  assert.equal(activeRuns.getByRunId("run_2"), replacement);
});

test("active runs clears only the expected handle", async () => {
  const { createActiveRuns } = await importFresh("../../src/runtime/active-runs.mjs");
  const activeRuns = createActiveRuns();
  const active = activeRuns.set("session-a", { runId: "run_1" });

  assert.equal(activeRuns.clear("session-a", { runId: "run_1" }), false);
  assert.equal(activeRuns.get("session-a"), active);
  assert.equal(activeRuns.clear("session-a", active), true);
  assert.equal(activeRuns.get("session-a"), null);
  assert.equal(activeRuns.getByRunId("run_1"), null);
});

test("active runs marks stop requested by route key or run id", async () => {
  const { createActiveRuns } = await importFresh("../../src/runtime/active-runs.mjs");
  const activeRuns = createActiveRuns();

  const active = activeRuns.set("session-a", { runId: "run_1" });

  assert.equal(activeRuns.requestStop("run_1", "operator_stop"), active);
  assert.equal(active.stopRequested, true);
  assert.equal(active.stopReason, "operator_stop");
  assert.equal(active.status, "stopping");
  assert.equal(activeRuns.requestStop("missing"), null);
});

test("active runs rejects empty identifiers", async () => {
  const { createActiveRuns } = await importFresh("../../src/runtime/active-runs.mjs");
  const activeRuns = createActiveRuns();

  assert.throws(() => activeRuns.set("", { runId: "run_1" }), /non-empty route key/);
  assert.throws(() => activeRuns.getByRunId(""), /non-empty run id/);
  assert.throws(() => activeRuns.requestStop(""), /non-empty route key or run id/);
});
