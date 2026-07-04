import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { importFresh } from "../helpers/module.js";

test("isolation probe fails when the runtime can write outside the workspace", async () => {
  const { runIsolationProbe } = await importFresh("../../src/security/isolation-probe.mjs");
  const root = await mkdtemp(path.join(os.tmpdir(), "codexbridge-isolation-"));
  const workspaceRoot = path.join(root, "workspace");
  const forbiddenPath = path.join(root, "host");
  await mkdir(forbiddenPath, { recursive: true });
  await writeFile(path.join(forbiddenPath, "secret.txt"), "secret", "utf8");

  const result = await runIsolationProbe({
    mode: "system_user",
    workspaceRoot,
    forbiddenPath,
  });

  assert.equal(result.status, "fail");
  assert.equal(result.checks.find((check) => check.id === "workspace_write").ok, true);
  assert.equal(result.checks.find((check) => check.id === "workspace_read").ok, true);
  assert.equal(result.checks.find((check) => check.id === "forbidden_read").ok, false);
  assert.equal(result.checks.find((check) => check.id === "forbidden_write").ok, false);
  assert.match(result.summary, /forbidden_path/);
});

test("isolation probe requires an explicit hard-isolation mode", async () => {
  const { runIsolationProbe } = await importFresh("../../src/security/isolation-probe.mjs");
  const root = await mkdtemp(path.join(os.tmpdir(), "codexbridge-isolation-mode-"));
  const workspaceRoot = path.join(root, "workspace");

  const result = await runIsolationProbe({
    mode: "none",
    workspaceRoot,
    forbiddenPath: path.join(root, "missing-host-path"),
  });

  assert.equal(result.status, "fail");
  assert.equal(result.checks.find((check) => check.id === "hard_isolation_mode").ok, false);
  assert.match(result.summary, /hard_isolation_mode_required/);
});

test("isolation probe config evidence keeps only readiness fields", async () => {
  const { isolationProbeToConfigEvidence } = await importFresh("../../src/security/isolation-probe.mjs");

  const evidence = isolationProbeToConfigEvidence({
    status: "pass",
    checkedAt: "2026-06-25T00:00:00.000Z",
    mode: "container",
    workspaceRoot: "/workspace",
    forbiddenPath: "/host",
    summary: "passed",
    checks: [{ id: "detail" }],
  });

  assert.deepEqual(evidence, {
    status: "pass",
    checkedAt: "2026-06-25T00:00:00.000Z",
    mode: "container",
    workspaceRoot: "/workspace",
    forbiddenPath: "/host",
    summary: "passed",
  });
});
