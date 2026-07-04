import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

function child(pid) {
  return {
    pid,
    exitCode: null,
    killed: false,
    kill(signal) {
      this.killed = true;
      this.signal = signal;
      return true;
    },
  };
}

test("process pool registers and snapshots child process metadata", async () => {
  const { createProcessPool } = await importFresh("../../src/runtime/process-pool.mjs");
  const pool = createProcessPool();
  const activeChild = child(123);

  const entry = pool.register("route-a", activeChild, {
    runId: "run_1",
    sessionKey: "feishu:user:1",
    routeKey: "route-a",
    channel: "feishu",
    startedAt: "2026-01-02T03:04:05.000Z",
    metadata: { source: "test" },
  });

  assert.equal(pool.get("route-a"), entry);
  assert.deepEqual(pool.snapshot(), [{
    key: "route-a",
    pid: 123,
    runId: "run_1",
    sessionKey: "feishu:user:1",
    routeKey: "route-a",
    channel: "feishu",
    startedAt: "2026-01-02T03:04:05.000Z",
    metadata: { source: "test" },
  }]);
});

test("process pool stops replaced child process", async () => {
  const { createProcessPool } = await importFresh("../../src/runtime/process-pool.mjs");
  const stopped = [];
  const pool = createProcessPool({
    requestChildStop: (nextChild, options) => {
      stopped.push([nextChild.pid, options.reason]);
      return true;
    },
  });

  pool.register("route-a", child(1));
  pool.register("route-a", child(2));

  assert.deepEqual(stopped, [[1, "replaced"]]);
  assert.equal(pool.get("route-a").pid, 2);
});

test("process pool filters by run, session, route, and channel", async () => {
  const { createProcessPool } = await importFresh("../../src/runtime/process-pool.mjs");
  const pool = createProcessPool();

  pool.register("a", child(1), { runId: "r1", sessionKey: "s1", routeKey: "a", channel: "feishu" });
  pool.register("b", child(2), { runId: "r2", sessionKey: "s1", routeKey: "b", channel: "telegram" });

  assert.deepEqual(pool.list({ sessionKey: "s1" }).map((entry) => entry.key), ["a", "b"]);
  assert.deepEqual(pool.list({ runId: "r2" }).map((entry) => entry.key), ["b"]);
  assert.deepEqual(pool.list({ channel: "feishu" }).map((entry) => entry.key), ["a"]);
  assert.deepEqual(pool.list({ routeKey: "b" }).map((entry) => entry.key), ["b"]);
});

test("process pool requestStop delegates to child stopper", async () => {
  const { createProcessPool } = await importFresh("../../src/runtime/process-pool.mjs");
  const calls = [];
  const pool = createProcessPool({
    requestChildStop: (nextChild, options) => {
      calls.push([nextChild.pid, options.reason, options.signal]);
      return true;
    },
  });
  pool.register("route-a", child(123));

  assert.deepEqual(pool.requestStop("missing"), {
    ok: false,
    stopped: false,
    reason: "process_not_found",
  });
  const stopped = pool.requestStop("route-a", "operator_stop", { signal: "SIGINT" });

  assert.equal(stopped.ok, true);
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.reason, "operator_stop");
  assert.deepEqual(calls, [[123, "operator_stop", "SIGINT"]]);
});

test("process pool terminate removes terminated process", async () => {
  const { createProcessPool } = await importFresh("../../src/runtime/process-pool.mjs");
  const pool = createProcessPool({
    terminateChildProcess: async (nextChild, options) => {
      nextChild.terminatedWith = options.signal;
      return true;
    },
  });
  const activeChild = child(123);
  pool.register("route-a", activeChild);

  const result = await pool.terminate("route-a", { signal: "SIGTERM" });

  assert.equal(result.ok, true);
  assert.equal(result.terminated, true);
  assert.equal(activeChild.terminatedWith, "SIGTERM");
  assert.equal(pool.get("route-a"), null);
});

test("process pool unregister requires matching child when provided", async () => {
  const { createProcessPool } = await importFresh("../../src/runtime/process-pool.mjs");
  const pool = createProcessPool();
  const activeChild = child(123);
  pool.register("route-a", activeChild);

  assert.equal(pool.unregister("route-a", child(456)), false);
  assert.equal(pool.get("route-a").child, activeChild);
  assert.equal(pool.unregister("route-a", activeChild), true);
  assert.equal(pool.unregister("route-a"), false);
});

test("process pool rejects missing keys and child handles", async () => {
  const { createProcessPool } = await importFresh("../../src/runtime/process-pool.mjs");
  const pool = createProcessPool();

  assert.throws(() => pool.register("", child(1)), /non-empty key/);
  assert.throws(() => pool.register("route-a", null), /child process handle/);
  assert.throws(() => pool.get(""), /non-empty key/);
});
