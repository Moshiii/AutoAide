import path from "node:path";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";

export const HARD_ISOLATION_MODES = Object.freeze([
  "system_user",
  "container",
  "microvm",
  "macos_sandbox",
  "remote_worker",
]);

function normalizePath(value, fallback) {
  return path.resolve(String(value || fallback || ".").trim());
}

function normalizeMode(value) {
  return String(value || "none").trim().toLowerCase();
}

function summarizeChecks(checks = []) {
  const failed = checks.filter((check) => !check.ok);
  if (failed.length === 0) {
    return "Workspace access is available and forbidden host path access was denied.";
  }
  return failed.map((check) => `${check.id}: ${check.reason}`).join("; ");
}

async function attempt(label, fn) {
  try {
    await fn();
    return { id: label, allowed: true, error: null };
  } catch (error) {
    return {
      id: label,
      allowed: false,
      error: {
        code: error?.code || "ERROR",
        message: error?.message || String(error),
      },
    };
  }
}

export async function runIsolationProbe(options = {}) {
  const mode = normalizeMode(options.mode);
  const hardModeConfigured = HARD_ISOLATION_MODES.includes(mode);
  const workspaceRoot = normalizePath(options.workspaceRoot);
  const forbiddenPath = normalizePath(options.forbiddenPath, path.join(workspaceRoot, "..", ".codexbridge-isolation-forbidden"));
  const marker = options.marker || `codexbridge-isolation-probe-${process.pid}`;
  const workspaceProbePath = path.join(workspaceRoot, ".codexbridge-isolation-probe");
  const forbiddenProbePath = path.join(forbiddenPath, marker);

  await mkdir(workspaceRoot, { recursive: true });
  const workspaceWrite = await attempt("workspace_write", async () => {
    await writeFile(workspaceProbePath, marker, "utf8");
  });
  const workspaceRead = await attempt("workspace_read", async () => {
    const raw = await readFile(workspaceProbePath, "utf8");
    if (raw !== marker) {
      throw new Error("Workspace probe marker did not round-trip.");
    }
  });
  await rm(workspaceProbePath, { force: true }).catch(() => {});

  const forbiddenRead = await attempt("forbidden_read", async () => {
    const target = await stat(forbiddenPath);
    if (target.isDirectory()) {
      await readdir(forbiddenPath);
      return;
    }
    await readFile(forbiddenPath, "utf8");
  });
  const forbiddenWrite = await attempt("forbidden_write", async () => {
    await mkdir(path.dirname(forbiddenProbePath), { recursive: true });
    await writeFile(forbiddenProbePath, marker, "utf8");
  });
  if (forbiddenWrite.allowed) {
    await rm(forbiddenProbePath, { force: true }).catch(() => {});
  }

  const checks = [
    {
      id: "hard_isolation_mode",
      ok: hardModeConfigured,
      reason: hardModeConfigured ? "ok" : "hard_isolation_mode_required",
      detail: {
        mode,
        allowedModes: HARD_ISOLATION_MODES,
      },
    },
    {
      id: "workspace_write",
      ok: workspaceWrite.allowed,
      reason: workspaceWrite.allowed ? "ok" : workspaceWrite.error?.code || "workspace_write_denied",
      detail: workspaceWrite,
    },
    {
      id: "workspace_read",
      ok: workspaceRead.allowed,
      reason: workspaceRead.allowed ? "ok" : workspaceRead.error?.code || "workspace_read_denied",
      detail: workspaceRead,
    },
    {
      id: "forbidden_read",
      ok: !forbiddenRead.allowed,
      reason: forbiddenRead.allowed ? "forbidden_path_readable" : "denied",
      detail: forbiddenRead,
    },
    {
      id: "forbidden_write",
      ok: !forbiddenWrite.allowed,
      reason: forbiddenWrite.allowed ? "forbidden_path_writable" : "denied",
      detail: forbiddenWrite,
    },
  ];
  const status = checks.every((check) => check.ok) ? "pass" : "fail";

  return {
    status,
    checkedAt: new Date().toISOString(),
    mode,
    workspaceRoot,
    forbiddenPath,
    summary: summarizeChecks(checks),
    checks,
  };
}

export function isolationProbeToConfigEvidence(result = {}) {
  const status = ["pass", "fail", "blocked"].includes(String(result.status || "").trim())
    ? String(result.status).trim()
    : "fail";
  return {
    status,
    checkedAt: typeof result.checkedAt === "string" ? result.checkedAt : new Date().toISOString(),
    mode: typeof result.mode === "string" ? result.mode : "",
    workspaceRoot: typeof result.workspaceRoot === "string" ? result.workspaceRoot : "",
    forbiddenPath: typeof result.forbiddenPath === "string" ? result.forbiddenPath : "",
    summary: typeof result.summary === "string" ? result.summary : "",
  };
}
