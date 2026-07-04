import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("migration feature flags default to disabled", async () => {
  const { readMigrationFeatureFlags } = await importFresh("../../src/runtime/feature-flags.mjs");
  const flags = readMigrationFeatureFlags({});

  assert.equal(flags.agentEvents.enabled, false);
  assert.equal(flags.runExecutor.enabled, false);
  assert.equal(flags.feishuGateway.enabled, false);
  assert.equal(flags.feishuMessageFlow.enabled, false);
  assert.equal(flags.telegramMessageFlow.enabled, false);
  assert.equal(flags.pendingQueue.enabled, false);
  assert.equal(flags.workspacePolicy.enabled, false);
});

test("migration feature flags parse common enabled values", async () => {
  const { isMigrationFeatureEnabled, readMigrationFeatureFlags } = await importFresh("../../src/runtime/feature-flags.mjs");
  const env = {
    CODEXBRIDGE_AGENT_EVENTS: "1",
    CODEXBRIDGE_RUN_EXECUTOR: "true",
    CODEXBRIDGE_FEISHU_GATEWAY: "yes",
    CODEXBRIDGE_FEISHU_CARDS: "on",
    CODEXBRIDGE_FEISHU_MESSAGE_FLOW: "1",
    CODEXBRIDGE_TELEGRAM_MESSAGE_FLOW: "true",
  };
  const flags = readMigrationFeatureFlags(env);

  assert.equal(flags.agentEvents.enabled, true);
  assert.equal(flags.runExecutor.enabled, true);
  assert.equal(flags.feishuGateway.enabled, true);
  assert.equal(flags.feishuCards.enabled, true);
  assert.equal(flags.feishuMessageFlow.enabled, true);
  assert.equal(flags.telegramMessageFlow.enabled, true);
  assert.equal(isMigrationFeatureEnabled("feishuCards", env), true);
  assert.equal(isMigrationFeatureEnabled("missing", env), false);
});
