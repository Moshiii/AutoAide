const MIGRATION_FLAGS = Object.freeze([
  ["agentEvents", "CODEXBRIDGE_AGENT_EVENTS"],
  ["runExecutor", "CODEXBRIDGE_RUN_EXECUTOR"],
  ["feishuGateway", "CODEXBRIDGE_FEISHU_GATEWAY"],
  ["feishuCards", "CODEXBRIDGE_FEISHU_CARDS"],
  ["feishuMessageFlow", "CODEXBRIDGE_FEISHU_MESSAGE_FLOW"],
  ["telegramMessageFlow", "CODEXBRIDGE_TELEGRAM_MESSAGE_FLOW"],
  ["pendingQueue", "CODEXBRIDGE_PENDING_QUEUE"],
  ["permissionBroker", "CODEXBRIDGE_PERMISSION_BROKER"],
  ["workspacePolicy", "CODEXBRIDGE_WORKSPACE_POLICY"],
]);

function parseBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function readMigrationFeatureFlags(env = process.env) {
  return Object.fromEntries(MIGRATION_FLAGS.map(([key, envName]) => [
    key,
    {
      enabled: parseBoolean(env[envName]),
      env: envName,
    },
  ]));
}

export function isMigrationFeatureEnabled(key, env = process.env) {
  const flags = readMigrationFeatureFlags(env);
  return Boolean(flags[key]?.enabled);
}

export function listMigrationFeatureFlags() {
  return MIGRATION_FLAGS.map(([key, env]) => ({ key, env }));
}
