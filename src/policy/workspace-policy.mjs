import path from "node:path";

function resolveRoot(workspaceRoot) {
  const root = String(workspaceRoot || "").trim();
  if (!root) {
    throw new Error("WorkspacePolicy requires workspaceRoot.");
  }
  return path.resolve(root);
}

function normalizePathList(values = [], root) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => path.resolve(root, value));
}

function isInside(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function createWorkspacePolicy(options = {}) {
  const workspaceRoot = resolveRoot(options.workspaceRoot);
  const allowReadPaths = normalizePathList(options.allowReadPaths?.length ? options.allowReadPaths : ["."], workspaceRoot);
  const allowWritePaths = normalizePathList(options.allowWritePaths?.length ? options.allowWritePaths : ["."], workspaceRoot);
  const denyPaths = normalizePathList(options.denyPaths || [], workspaceRoot);

  function resolveCandidate(relativeOrAbsolutePath = ".") {
    const raw = String(relativeOrAbsolutePath || ".").trim();
    const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(workspaceRoot, raw);
    if (!isInside(candidate, workspaceRoot)) {
      return {
        ok: false,
        reason: "outside_workspace",
        path: candidate,
      };
    }
    if (denyPaths.some((denyPath) => isInside(candidate, denyPath) || candidate === denyPath)) {
      return {
        ok: false,
        reason: "denied_path",
        path: candidate,
      };
    }
    return {
      ok: true,
      path: candidate,
    };
  }

  function canRead(relativeOrAbsolutePath = ".") {
    const resolved = resolveCandidate(relativeOrAbsolutePath);
    if (!resolved.ok) {
      return resolved;
    }
    const allowed = allowReadPaths.some((allowPath) => isInside(resolved.path, allowPath));
    return allowed ? resolved : { ...resolved, ok: false, reason: "read_not_allowed" };
  }

  function canWrite(relativeOrAbsolutePath = ".") {
    const resolved = resolveCandidate(relativeOrAbsolutePath);
    if (!resolved.ok) {
      return resolved;
    }
    const allowed = allowWritePaths.some((allowPath) => isInside(resolved.path, allowPath));
    return allowed ? resolved : { ...resolved, ok: false, reason: "write_not_allowed" };
  }

  return {
    workspaceRoot,
    canRead,
    canWrite,
    resolveCandidate,
    toJSON() {
      return {
        workspaceRoot,
        allowReadPaths,
        allowWritePaths,
        denyPaths,
      };
    },
  };
}

export function createDefaultWorkspacePolicy({ workspaceRoot, role = "user" } = {}) {
  const isOwner = String(role || "").toLowerCase() === "owner";
  return createWorkspacePolicy({
    workspaceRoot,
    allowReadPaths: ["."],
    allowWritePaths: isOwner ? ["."] : ["outputs", "work"],
    denyPaths: [".env", ".ssh", "secrets"],
  });
}
