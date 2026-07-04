import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { importFresh, withTempHome } from "../helpers/module.js";

test("createRunRecord stores a queued run", async () => {
  await withTempHome(async () => {
    const runs = await importFresh("../../src/runs-state.mjs");

    const run = await runs.createRunRecord({
      userId: "telegram:1",
      channel: "telegram",
      chatType: "group",
      status: "queued",
    });

    assert.ok(run.runId);
    assert.equal(run.userId, "telegram:1");
    assert.equal(run.status, "queued");
  });
});

test("updateRunRecord appends latest run snapshot", async () => {
  await withTempHome(async () => {
    const runs = await importFresh("../../src/runs-state.mjs");

    const run = await runs.createRunRecord({
      userId: "telegram:1",
      status: "queued",
    });
    await runs.updateRunRecord(run.runId, {
      status: "running",
    });
    await runs.updateRunRecord(run.runId, {
      status: "completed",
      creditsCharged: 1,
      costSource: "daily_free",
      codexThreadId: "thread_1",
      outputPreview: "done",
    });
    const latest = await runs.getRunRecord(run.runId);

    assert.equal(latest.status, "completed");
    assert.equal(latest.creditsCharged, 1);
    assert.equal(latest.codexThreadId, "thread_1");
    assert.equal(latest.outputPreview, "done");
    assert.ok(latest.finishedAt);
  });
});

test("listRunRecords filters by user", async () => {
  await withTempHome(async () => {
    const runs = await importFresh("../../src/runs-state.mjs");

    await runs.createRunRecord({ userId: "telegram:1" });
    await runs.createRunRecord({ userId: "telegram:2" });

    const records = await runs.listRunRecords({ userId: "telegram:1" });

    assert.equal(records.length, 1);
    assert.equal(records[0].userId, "telegram:1");
  });
});

test("listRunRecords reads legacy snapshots with additive migration defaults", async () => {
  await withTempHome(async (home) => {
    const runs = await importFresh("../../src/runs-state.mjs");
    const botHome = path.join(home, ".codexbridge", "bots", "default");
    await mkdir(botHome, { recursive: true });
    await writeFile(path.join(botHome, "runs.jsonl"), `${JSON.stringify({
      runId: "legacy-run-1",
      userId: "telegram:1",
      status: "completed",
      outputPreview: "done before migration",
      reason: "legacy_reason",
      error: "",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:01.000Z",
    })}\n`, "utf8");

    const latest = await runs.getRunRecord("legacy-run-1", botHome);

    assert.equal(latest.runId, "legacy-run-1");
    assert.equal(latest.userId, "telegram:1");
    assert.equal(latest.status, "completed");
    assert.equal(latest.outputPreview, "done before migration");
    assert.equal(latest.reason, "legacy_reason");
    assert.equal(latest.agentProvider, "");
    assert.deepEqual(latest.events, []);
    assert.deepEqual(latest.policy, {
      workspacePolicyId: null,
      runPolicyId: null,
    });
  });
});
