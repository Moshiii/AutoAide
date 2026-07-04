import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { importFresh, withTempHome } from "../helpers/module.js";

test("rollback readiness passes with readable run and usage ledgers", async () => {
  await withTempHome(async (botHome) => {
    const runs = await importFresh("../../src/runs-state.mjs");
    const usage = await importFresh("../../src/usage-ledger.mjs");
    const rollback = await importFresh("../../src/rollback-readiness.mjs");

    const run = await runs.createRunRecord({
      userId: "telegram:1",
      channel: "telegram",
      chatType: "group",
      status: "completed",
    }, botHome);
    await usage.appendUsageEvent({
      eventType: "charge",
      userId: "telegram:1",
      channel: "telegram",
      chatType: "group",
      runId: run.runId,
      amount: 1,
      source: "daily_free",
    }, botHome);

    const result = await rollback.evaluateRollbackReadiness({ botHome });

    assert.equal(result.ok, true);
    assert.equal(result.files.runs.records, 1);
    assert.equal(result.files.usage.records, 1);
    assert.match(rollback.formatRollbackReadinessReport(result), /Rollback readiness: PASS/);
  });
});

test("rollback readiness fails on malformed JSON and invalid ledger fields", async () => {
  await withTempHome(async (botHome) => {
    const rollback = await importFresh("../../src/rollback-readiness.mjs");
    await mkdir(botHome, { recursive: true });
    await writeFile(path.join(botHome, "runs.jsonl"), [
      JSON.stringify({ runId: "run_bad", userId: "telegram:1", status: "migrated" }),
      "{bad json",
      "",
    ].join("\n"), "utf8");
    await writeFile(path.join(botHome, "usage-ledger.jsonl"), [
      JSON.stringify({ eventId: "usage_bad", eventType: "mystery", userId: "", amount: "NaN" }),
      "",
    ].join("\n"), "utf8");

    const result = await rollback.evaluateRollbackReadiness({ botHome });
    const report = rollback.formatRollbackReadinessReport(result);

    assert.equal(result.ok, false);
    assert.equal(result.files.runs.malformed, 1);
    assert.equal(result.checks.some((check) => check.reason === "invalid_status:migrated"), true);
    assert.equal(result.checks.some((check) => check.reason === "invalid_event_type:mystery"), true);
    assert.equal(result.checks.some((check) => check.reason === "missing_user_id"), true);
    assert.match(report, /Rollback readiness: FAIL/);
    assert.match(report, /malformed_json/);
  });
});

test("rollback readiness fails when migration flags remain enabled", async () => {
  await withTempHome(async (botHome) => {
    const rollback = await importFresh("../../src/rollback-readiness.mjs");

    const result = await rollback.evaluateRollbackReadiness({
      botHome,
      env: {
        CODEXBRIDGE_RUN_EXECUTOR: "1",
        CODEXBRIDGE_FEISHU_MESSAGE_FLOW: "true",
      },
    });
    const report = rollback.formatRollbackReadinessReport(result);

    assert.equal(result.ok, false);
    assert.equal(result.checks.some((check) => check.reason === "migration_flag_enabled:CODEXBRIDGE_RUN_EXECUTOR"), true);
    assert.equal(result.checks.some((check) => check.reason === "migration_flag_enabled:CODEXBRIDGE_FEISHU_MESSAGE_FLOW"), true);
    assert.equal(result.featureFlags.runExecutor.enabled, true);
    assert.match(report, /migration_flag_enabled/);
  });
});
