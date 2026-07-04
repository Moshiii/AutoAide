import { readFile } from "node:fs/promises";

import { getRunsStatePath, getUsageLedgerPath, resolveBotHome } from "./config.mjs";
import { readMigrationFeatureFlags } from "./runtime/feature-flags.mjs";

const RUN_STATUSES = new Set(["queued", "running", "completed", "failed", "stopped", "denied"]);
const USAGE_EVENT_TYPES = new Set(["grant", "charge", "refund", "adjustment", "deny"]);

function normalizeString(value) {
  return String(value || "").trim();
}

async function readJsonl(filePath) {
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        exists: false,
        records: [],
        malformed: [],
      };
    }
    throw error;
  }
  const records = [];
  const malformed = [];
  raw.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    try {
      records.push(JSON.parse(trimmed));
    } catch (error) {
      malformed.push({
        line: index + 1,
        reason: error.message,
      });
    }
  });
  return {
    exists: true,
    records,
    malformed,
  };
}

function checkRuns(records = []) {
  const checks = [];
  for (const [index, record] of records.entries()) {
    const location = `runs:${index + 1}`;
    const runId = normalizeString(record?.runId);
    const status = normalizeString(record?.status).toLowerCase();
    const userId = normalizeString(record?.userId);
    if (!runId) {
      checks.push({ ok: false, id: `${location}:runId`, reason: "missing_run_id" });
    }
    if (!RUN_STATUSES.has(status)) {
      checks.push({ ok: false, id: `${location}:status`, runId, reason: `invalid_status:${status || "(missing)"}` });
    }
    if (!userId) {
      checks.push({ ok: false, id: `${location}:userId`, runId, reason: "missing_user_id" });
    }
  }
  return checks;
}

function checkUsage(records = []) {
  const checks = [];
  for (const [index, record] of records.entries()) {
    const location = `usage:${index + 1}`;
    const eventType = normalizeString(record?.eventType || record?.type).toLowerCase();
    const eventId = normalizeString(record?.eventId);
    const userId = normalizeString(record?.userId);
    const amount = Number(record?.amount ?? 0);
    if (!eventId) {
      checks.push({ ok: false, id: `${location}:eventId`, reason: "missing_event_id" });
    }
    if (!USAGE_EVENT_TYPES.has(eventType)) {
      checks.push({ ok: false, id: `${location}:eventType`, eventId, reason: `invalid_event_type:${eventType || "(missing)"}` });
    }
    if (!userId) {
      checks.push({ ok: false, id: `${location}:userId`, eventId, reason: "missing_user_id" });
    }
    if (!Number.isFinite(amount)) {
      checks.push({ ok: false, id: `${location}:amount`, eventId, reason: "invalid_amount" });
    }
  }
  return checks;
}

function checkMigrationFlags(env = process.env) {
  const flags = readMigrationFeatureFlags(env);
  return Object.entries(flags)
    .filter(([, flag]) => flag.enabled)
    .map(([key, flag]) => ({
      ok: false,
      id: `flag:${key}`,
      reason: `migration_flag_enabled:${flag.env}`,
    }));
}

export async function evaluateRollbackReadiness({ botHome = resolveBotHome(), env = process.env } = {}) {
  const runsPath = getRunsStatePath(botHome);
  const usagePath = getUsageLedgerPath(botHome);
  const [runs, usage] = await Promise.all([
    readJsonl(runsPath),
    readJsonl(usagePath),
  ]);
  const checks = [
    ...checkMigrationFlags(env),
    ...runs.malformed.map((item) => ({
      ok: false,
      id: `runs:line:${item.line}`,
      reason: `malformed_json:${item.reason}`,
    })),
    ...usage.malformed.map((item) => ({
      ok: false,
      id: `usage:line:${item.line}`,
      reason: `malformed_json:${item.reason}`,
    })),
    ...checkRuns(runs.records),
    ...checkUsage(usage.records),
  ];
  const ok = checks.every((check) => check.ok);
  return {
    ok,
    botHome,
    featureFlags: readMigrationFeatureFlags(env),
    files: {
      runs: {
        path: runsPath,
        exists: runs.exists,
        records: runs.records.length,
        malformed: runs.malformed.length,
      },
      usage: {
        path: usagePath,
        exists: usage.exists,
        records: usage.records.length,
        malformed: usage.malformed.length,
      },
    },
    checks,
    summary: ok
      ? "Rollback readiness passed: run ledger and usage ledger are readable."
      : `Rollback readiness failed: ${checks.filter((check) => !check.ok).length} issue(s) found.`,
  };
}

export function formatRollbackReadinessReport(result = {}) {
  const lines = [
    `Rollback readiness: ${result.ok ? "PASS" : "FAIL"}`,
    result.summary || "",
    `Runs: ${result.files?.runs?.records ?? 0} record(s), malformed=${result.files?.runs?.malformed ?? 0}`,
    `Usage: ${result.files?.usage?.records ?? 0} record(s), malformed=${result.files?.usage?.malformed ?? 0}`,
  ];
  const failures = (result.checks || []).filter((check) => !check.ok);
  if (failures.length > 0) {
    lines.push("");
    for (const failure of failures) {
      lines.push(`FAIL ${failure.id} - ${failure.reason}`);
    }
  }
  return lines.join("\n");
}
