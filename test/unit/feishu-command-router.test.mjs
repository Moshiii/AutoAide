import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

function createDeps(sent) {
  return {
    sendText: async (_client, _chatId, text) => sent.push(text),
    renderWelcomeMessage: () => "welcome",
    renderHelpMessage: () => "help",
    renderUnsupportedCommandMessage: (command) => `unsupported ${command}`,
    renderCreditsStatus: () => "credits",
    getUserCredits: async () => ({
      account: { userId: "feishu:ou_1" },
      defaults: { turnCost: 1 },
    }),
  };
}

test("Feishu command router parses slash commands", async () => {
  const { parseSlashCommand } = await importFresh("../../src/feishu/command-router.mjs");

  assert.equal(parseSlashCommand(" /help now"), "/help");
  assert.equal(parseSlashCommand("hello /credits"), "/credits");
  assert.equal(parseSlashCommand("hello"), null);
});

test("Feishu command router handles help, where, credits, and unknown commands", async () => {
  const { handleFeishuSlashCommand } = await importFresh("../../src/feishu/command-router.mjs");
  const sent = [];
  const base = {
    chatState: { sessionLabel: "feishu-u-1", cliSessionRef: "thread_1" },
    client: {},
    chatId: "oc_1",
    activeRuns: new Map(),
    routeKey: "route",
    botConfig: {},
    envelope: { userId: "ou_1", chatType: "direct", isDirect: true },
    options: { user: { id: "feishu:ou_1" }, botHome: "/tmp/bot" },
    deps: createDeps(sent),
  };

  assert.equal(await handleFeishuSlashCommand({ ...base, command: "/help" }), true);
  assert.equal(await handleFeishuSlashCommand({ ...base, command: "/where" }), true);
  assert.equal(await handleFeishuSlashCommand({ ...base, command: "/credits" }), true);
  assert.equal(await handleFeishuSlashCommand({ ...base, command: "/wat" }), true);

  assert.deepEqual(sent, [
    "help",
    "Current session: feishu-u-1\nresume=thread_1",
    "credits",
    "unsupported /wat",
  ]);
});

test("Feishu command router handles stop command through injected stopper", async () => {
  const { handleFeishuSlashCommand } = await importFresh("../../src/feishu/command-router.mjs");
  const sent = [];
  const activeRuns = new Map([["route", { pid: 1 }]]);

  assert.equal(await handleFeishuSlashCommand({
    command: "/stop",
    chatState: { sessionLabel: "feishu-u-1" },
    client: {},
    chatId: "oc_1",
    activeRuns,
    routeKey: "route",
    botConfig: {},
    envelope: {},
    deps: {
      ...createDeps(sent),
      requestActiveRunStop: () => true,
    },
  }), true);

  assert.deepEqual(sent, ["Stop requested for [feishu-u-1]."]);
});
