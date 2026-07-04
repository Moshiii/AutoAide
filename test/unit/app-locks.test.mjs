import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { importFresh } from "../helpers/module.js";

async function tempLockPath() {
  const dir = await mkdtemp(path.join(tmpdir(), "codexbridge-app-lock-"));
  return path.join(dir, "runtime.pid");
}

test("app locks acquire, inspect, and release current process lock", async () => {
  const { acquireAppLock, inspectAppLock, releaseAppLock } = await importFresh("../../src/runtime/app-locks.mjs");
  const lockPath = await tempLockPath();

  const acquired = await acquireAppLock(lockPath, { label: "Bot runtime" });

  assert.equal(acquired.path, lockPath);
  assert.equal(acquired.pid, process.pid);
  assert.equal(acquired.running, true);
  assert.equal((await inspectAppLock(lockPath)).pid, process.pid);

  assert.deepEqual(await releaseAppLock(lockPath), {
    ok: true,
    released: true,
    path: lockPath,
    pid: process.pid,
  });
  assert.equal((await inspectAppLock(lockPath)).pid, null);
});

test("app locks reject a running existing pid with a scoped message", async () => {
  const { acquireAppLock } = await importFresh("../../src/runtime/app-locks.mjs");
  const lockPath = await tempLockPath();
  await writeFile(lockPath, JSON.stringify({ pid: process.pid, startedAt: "now" }), "utf8");

  await assert.rejects(
    () => acquireAppLock(lockPath, { label: "Feishu bridge" }),
    new RegExp(`Feishu bridge already running with pid ${process.pid}`),
  );
});

test("app locks replace stale pid files", async () => {
  const { acquireAppLock } = await importFresh("../../src/runtime/app-locks.mjs");
  const lockPath = await tempLockPath();
  await writeFile(lockPath, JSON.stringify({ pid: 99999999, startedAt: "old" }), "utf8");

  const acquired = await acquireAppLock(lockPath, { label: "Bot runtime" });

  assert.equal(acquired.pid, process.pid);
  assert.equal(acquired.running, true);
});

test("app locks release only when expected pid owns the lock", async () => {
  const { inspectAppLock, releaseAppLock } = await importFresh("../../src/runtime/app-locks.mjs");
  const lockPath = await tempLockPath();
  await writeFile(lockPath, JSON.stringify({ pid: process.pid, startedAt: "now" }), "utf8");

  assert.deepEqual(await releaseAppLock(lockPath, { expectedPid: 99999999 }), {
    ok: false,
    released: false,
    reason: "lock_owned_by_other_pid",
    path: lockPath,
    pid: process.pid,
    expectedPid: 99999999,
  });
  assert.equal((await inspectAppLock(lockPath)).pid, process.pid);

  assert.equal((await releaseAppLock(lockPath, { expectedPid: process.pid })).ok, true);
});

test("app lock factory keeps path and label with bound operations", async () => {
  const { createAppLock } = await importFresh("../../src/runtime/app-locks.mjs");
  const lockPath = await tempLockPath();
  const lock = createAppLock(lockPath, { label: "Telegram bridge" });

  assert.equal(lock.path, lockPath);
  assert.equal(lock.label, "Telegram bridge");
  assert.equal((await lock.acquire()).pid, process.pid);
  assert.equal((await lock.inspect()).running, true);
  assert.equal((await lock.release()).released, true);
});

test("app locks reject empty paths", async () => {
  const { acquireAppLock, createAppLock, inspectAppLock, releaseAppLock } = await importFresh("../../src/runtime/app-locks.mjs");

  await assert.rejects(() => acquireAppLock(""), /non-empty lock path/);
  await assert.rejects(() => inspectAppLock(""), /non-empty lock path/);
  await assert.rejects(() => releaseAppLock(""), /non-empty lock path/);
  assert.throws(() => createAppLock(""), /non-empty lock path/);
});
