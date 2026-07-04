import { readFile, rm } from "node:fs/promises";

import {
  isPidRunning,
  readPidFile,
  writeCurrentPidFile,
} from "../pid-files.mjs";

function normalizePath(value) {
  const filePath = String(value || "").trim();
  if (!filePath) {
    throw new Error("AppLock requires a non-empty lock path.");
  }
  return filePath;
}

function normalizeLabel(value) {
  return String(value || "runtime").trim() || "runtime";
}

async function readLockPayload(lockPath) {
  try {
    const raw = (await readFile(lockPath, "utf8")).trim();
    if (!raw) {
      return { pid: null, startedAt: null, raw: "" };
    }
    if (!raw.startsWith("{")) {
      const pid = Number.parseInt(raw, 10);
      return {
        pid: Number.isInteger(pid) && pid > 0 ? pid : null,
        startedAt: null,
        raw,
      };
    }
    const parsed = JSON.parse(raw);
    const pid = Number.parseInt(parsed?.pid, 10);
    return {
      ...parsed,
      pid: Number.isInteger(pid) && pid > 0 ? pid : null,
      raw,
    };
  } catch {
    return { pid: null, startedAt: null, raw: "" };
  }
}

export async function inspectAppLock(lockPath) {
  const normalizedPath = normalizePath(lockPath);
  const payload = await readLockPayload(normalizedPath);
  const running = Boolean(payload.pid && isPidRunning(payload.pid));
  return {
    path: normalizedPath,
    pid: payload.pid,
    startedAt: payload.startedAt || null,
    running,
    stale: Boolean(payload.pid && !running),
  };
}

export async function acquireAppLock(lockPath, options = {}) {
  const normalizedPath = normalizePath(lockPath);
  const label = normalizeLabel(options.label);
  await writeCurrentPidFile(normalizedPath, {
    conflictMessage: (pid) => `${label} already running with pid ${pid}`,
  });
  return inspectAppLock(normalizedPath);
}

export async function releaseAppLock(lockPath, options = {}) {
  const normalizedPath = normalizePath(lockPath);
  const expectedPid = options.expectedPid ?? process.pid;
  const currentPid = await readPidFile(normalizedPath);
  if (!currentPid) {
    return {
      ok: false,
      released: false,
      reason: "lock_missing",
      path: normalizedPath,
    };
  }
  if (expectedPid && currentPid !== expectedPid) {
    return {
      ok: false,
      released: false,
      reason: "lock_owned_by_other_pid",
      path: normalizedPath,
      pid: currentPid,
      expectedPid,
    };
  }
  await rm(normalizedPath, { force: true });
  return {
    ok: true,
    released: true,
    path: normalizedPath,
    pid: currentPid,
  };
}

export function createAppLock(lockPath, options = {}) {
  const normalizedPath = normalizePath(lockPath);
  const label = normalizeLabel(options.label);
  return {
    path: normalizedPath,
    label,
    acquire: (nextOptions = {}) => acquireAppLock(normalizedPath, { label, ...nextOptions }),
    inspect: () => inspectAppLock(normalizedPath),
    release: (nextOptions = {}) => releaseAppLock(normalizedPath, nextOptions),
  };
}
