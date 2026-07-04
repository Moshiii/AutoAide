import test from "node:test";
import assert from "node:assert/strict";

import { importFresh, withTempHome } from "../helpers/module.js";

test("feishu bridge helpers can be imported without starting the bridge", async () => {
  await withTempHome(async () => {
    const bridge = await importFresh("../../plugins/feishu-codex/feishu-codex-bridge.mjs");

    assert.equal(typeof bridge.canFeishuUserAccessChat, "function");
    assert.equal(typeof bridge.renderCreditsStatus, "function");
  });
});

test("canFeishuUserAccessChat gates private chat behind paid access", async () => {
  await withTempHome(async () => {
    const { canFeishuUserAccessChat } = await importFresh("../../plugins/feishu-codex/feishu-codex-bridge.mjs");
    const freeUser = {
      status: "free",
      privateEnabled: false,
    };
    const unlockedUser = {
      status: "free",
      privateEnabled: true,
    };

    assert.equal(canFeishuUserAccessChat(freeUser, { chatType: "group" }), true);
    assert.equal(canFeishuUserAccessChat(freeUser, { chatType: "direct" }), false);
    assert.equal(canFeishuUserAccessChat(unlockedUser, { chatType: "direct" }), true);
    assert.equal(canFeishuUserAccessChat({ status: "banned" }, { chatType: "group" }), false);
  });
});

test("renderCreditsStatus includes daily free and paid credit fields", async () => {
  await withTempHome(async () => {
    const { renderCreditsStatus } = await importFresh("../../plugins/feishu-codex/feishu-codex-bridge.mjs");

    const text = renderCreditsStatus(
      {
        account: {
          userId: "feishu:ou_1",
          paidCredits: 7,
          dailyFreeUsed: 2,
          dailyFreeLimit: 5,
          totalConsumed: 9,
        },
        defaults: {
          turnCost: 1,
        },
      },
      {
        status: "paid",
        privateEnabled: true,
      },
    );

    assert.match(text, /CodexBridge credits/);
    assert.match(text, /User: feishu:ou_1/);
    assert.match(text, /Plan: paid/);
    assert.match(text, /Private chat: unlocked/);
    assert.match(text, /Daily free used: 2\/5/);
    assert.match(text, /Daily free remaining: 3/);
    assert.match(text, /Paid credits: 7/);
    assert.match(text, /Next: send a direct message to this bot for private work/);
    assert.match(text, /Group chat is still public/);
    assert.match(text, /private chat uses paid credits/);
  });
});

test("Feishu run command config applies workspace policy only when enabled", async () => {
  await withTempHome(async (tempHome) => {
    const { buildFeishuRunCommandConfig } = await importFresh("../../plugins/feishu-codex/feishu-codex-bridge.mjs");
    const baseCommandConfig = {
      cwd: "/tmp/outside",
      startCommand: "codex exec --json -",
      resumeTemplate: "codex exec resume __SESSION_ID__ -",
      model: "gpt-5.4",
    };

    assert.equal(buildFeishuRunCommandConfig({
      baseCommandConfig,
      enabled: false,
    }), baseCommandConfig);

    const secured = buildFeishuRunCommandConfig({
      baseCommandConfig,
      botHome: tempHome,
      envelope: { chatType: "group" },
      user: { status: "free" },
      usageUserId: "feishu:ou_1",
      config: { ownerUserId: "feishu:owner" },
      enabled: true,
      env: {
        PATH: "/bin",
        OPENAI_API_KEY: "sk-test",
        SECRET_TOKEN: "hidden",
      },
    });

    assert.match(secured.cwd, /workspace$/);
    assert.deepEqual(secured.env, {
      PATH: "/bin",
      OPENAI_API_KEY: "sk-test",
    });
    assert.equal(secured.runPolicy.allowShell, false);
    assert.equal(secured.runPolicy.allowNetwork, false);
    assert.equal(secured.workspacePolicy.workspaceRoot, secured.cwd);
  });
});

test("feishu welcome and help explain free group use and private unlock", async () => {
  await withTempHome(async () => {
    const { renderHelpMessage, renderWelcomeMessage } = await importFresh("../../plugins/feishu-codex/feishu-codex-bridge.mjs");

    const welcome = renderWelcomeMessage();
    const help = renderHelpMessage();

    assert.match(welcome, /mention CodexBridge or the app name/);
    assert.match(welcome, /CodexBridge summarize this repo in 3 bullets/);
    assert.match(welcome, /daily free quota/);
    assert.match(welcome, /Everyone in the group can see/);
    assert.match(welcome, /Use \/credits/);
    assert.match(welcome, /Private chat unlocks/);
    assert.match(help, /\/start - show the quick start/);
    assert.match(help, /Operators manage credits/);
  });
});

test("feishu common error prompts stay actionable", async () => {
  await withTempHome(async () => {
    const {
      renderBusyMessage,
      renderQueuedMessage,
      renderRequestFailedMessage,
      renderUnsupportedCommandMessage,
      renderUnsupportedPayloadMessage,
    } = await importFresh("../../plugins/feishu-codex/feishu-codex-bridge.mjs");

    assert.match(renderUnsupportedPayloadMessage(), /plain text messages/);
    assert.match(renderUnsupportedPayloadMessage(), /Feishu doc link/);
    assert.match(renderUnsupportedPayloadMessage(), /attachment download\/upload/);
    assert.match(renderUnsupportedCommandMessage("/foo"), /Use \/help/);
    assert.match(renderBusyMessage("main"), /use \/stop/);
    assert.match(renderQueuedMessage("main", 2), /position 2/);
    assert.match(renderQueuedMessage("main", 2), /No credits have been charged yet/);
    assert.match(renderRequestFailedMessage("codex missing"), /Paid credits charged/);
    assert.match(renderRequestFailedMessage("codex missing"), /daily free quota does not spend paid credits/);
    assert.match(renderRequestFailedMessage("codex missing"), /ask the operator/);
    assert.match(renderRequestFailedMessage("codex missing"), /runtime log/);
  });
});
