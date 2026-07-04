const DEFAULT_ENV_ALLOWLIST = Object.freeze([
  "HOME",
  "PATH",
  "SHELL",
  "TMPDIR",
  "USER",
  "LANG",
  "LC_ALL",
  "CODEX_HOME",
  "OPENAI_API_KEY",
]);

function toBoolean(value, fallback = false) {
  return value == null ? fallback : Boolean(value);
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createRunPolicy(options = {}) {
  const envAllowlist = Array.isArray(options.envAllowlist)
    ? options.envAllowlist.map((key) => String(key || "").trim()).filter(Boolean)
    : [...DEFAULT_ENV_ALLOWLIST];
  return {
    allowNetwork: toBoolean(options.allowNetwork, false),
    allowShell: toBoolean(options.allowShell, false),
    allowGit: toBoolean(options.allowGit, false),
    allowMcp: toBoolean(options.allowMcp, false),
    maxRunSeconds: normalizePositiveInteger(options.maxRunSeconds, 300),
    maxOutputBytes: normalizePositiveInteger(options.maxOutputBytes, 1_000_000),
    envAllowlist,
  };
}

export function createDefaultRunPolicy({ role = "user", chatType = "direct" } = {}) {
  const normalizedRole = String(role || "").toLowerCase();
  const normalizedChatType = String(chatType || "").toLowerCase();
  const isOwner = normalizedRole === "owner";
  const isGroup = normalizedChatType === "group";
  return createRunPolicy({
    allowNetwork: isOwner && !isGroup,
    allowShell: isOwner && !isGroup,
    allowGit: isOwner && !isGroup,
    allowMcp: isOwner && !isGroup,
    maxRunSeconds: isOwner ? 900 : 180,
    maxOutputBytes: isOwner ? 2_000_000 : 500_000,
  });
}

export function filterEnv(env = process.env, policy = createRunPolicy()) {
  const allowed = new Set(policy.envAllowlist || []);
  return Object.fromEntries(
    Object.entries(env)
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) => [key, String(value)]),
  );
}

export function canUseCapability(policy = {}, capability) {
  const normalized = String(capability || "").trim().toLowerCase();
  if (normalized === "network") {
    return Boolean(policy.allowNetwork);
  }
  if (normalized === "shell") {
    return Boolean(policy.allowShell);
  }
  if (normalized === "git") {
    return Boolean(policy.allowGit);
  }
  if (normalized === "mcp") {
    return Boolean(policy.allowMcp);
  }
  return false;
}
