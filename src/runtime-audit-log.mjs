import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getRuntimeAuditLogPath, resolveBotHome } from "./config.mjs";
import { formatLogEvent } from "./structured-logger.mjs";

const EVENT_FIELD_ALLOWLIST = new Set([
  "action",
  "actionId",
  "blockingLabels",
  "charged",
  "costSource",
  "failureType",
  "limit",
  "policyAction",
  "position",
  "questionId",
  "reason",
  "refunded",
  "routeKey",
  "skipped",
]);

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function normalizeFeatureFlags(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const flags = {};
  for (const [key, flag] of Object.entries(value)) {
    if (!key) {
      continue;
    }
    flags[key] = {
      env: normalizeString(flag?.env),
      enabled: Boolean(flag?.enabled),
    };
  }
  return flags;
}

function pickEventContext(details = {}) {
  const context = {};
  for (const key of EVENT_FIELD_ALLOWLIST) {
    if (details[key] !== undefined && details[key] !== null && details[key] !== "") {
      context[key] = details[key];
    }
  }
  return context;
}

export function createRuntimeAuditEvent(input = {}) {
  const details = input.details && typeof input.details === "object" && !Array.isArray(input.details)
    ? input.details
    : {};
  return {
    event: normalizeString(input.event || details.event) || "runtime event",
    runId: normalizeString(details.runId || input.runId),
    sessionKey: normalizeString(details.sessionKey || input.sessionKey),
    channel: normalizeString(details.channel || input.channel),
    userId: normalizeString(details.userId || input.userId),
    chatId: normalizeString(details.chatId || input.chatId),
    botHome: normalizeString(details.botHome || input.botHome),
    featureFlags: normalizeFeatureFlags(details.featureFlags || input.featureFlags),
    durationMs: normalizeNumber(details.durationMs ?? input.durationMs),
    errorCode: normalizeString(details.errorCode || input.errorCode),
    ...pickEventContext(details),
  };
}

export function formatRuntimeAuditEvent(input = {}) {
  const level = normalizeString(input.level) || "info";
  return formatLogEvent({
    level,
    event: input.event,
    details: createRuntimeAuditEvent(input),
    timestamp: input.timestamp,
  });
}

export async function appendRuntimeAuditEvent(input = {}, botHome = resolveBotHome()) {
  const filePath = input.filePath || getRuntimeAuditLogPath(botHome);
  await mkdir(path.dirname(filePath), { recursive: true });
  const line = formatRuntimeAuditEvent({
    ...input,
    botHome: input.botHome || botHome,
  });
  await writeFile(filePath, `${line}\n`, { flag: "a" });
  return JSON.parse(line);
}

export async function listRuntimeAuditEvents({
  botHome = resolveBotHome(),
  limit = 100,
  runId = null,
  event = null,
} = {}) {
  const filePath = getRuntimeAuditLogPath(botHome);
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return [];
  }
  const normalizedRunId = runId == null ? null : normalizeString(runId);
  const normalizedEvent = event == null ? null : normalizeString(event);
  const records = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const record = JSON.parse(trimmed);
      if (normalizedRunId && record.runId !== normalizedRunId) {
        continue;
      }
      if (normalizedEvent && record.event !== normalizedEvent) {
        continue;
      }
      records.push(record);
    } catch {
      // Ignore malformed audit rows.
    }
  }
  return records.slice(-Math.max(1, Number.parseInt(String(limit), 10) || 100));
}
