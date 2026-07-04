import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { importFresh } from "../helpers/module.js";

const FIXTURES = path.resolve("test/fixtures/telegram");

async function readFixture(filename) {
  return JSON.parse(await readFile(path.join(FIXTURES, filename), "utf8"));
}

async function createHarness() {
  const root = await mkdtemp(path.join(os.tmpdir(), "codexbridge-telegram-flow-"));
  return {
    botHome: path.join(root, "bot"),
    routerStatePath: path.join(root, "telegram", "sessions.json"),
    sent: [],
    logs: [],
  };
}

test("Telegram message flow runs private text through prepare, runner, logs, and replies", async () => {
  const { handleTelegramTextMessageFlow } = await importFresh("../../src/telegram/message-flow.mjs");
  const harness = await createHarness();
  const message = await readFixture("private-message.json");
  const calls = [];

  const result = await handleTelegramTextMessageFlow({
    message,
    botHome: harness.botHome,
    routerStatePath: harness.routerStatePath,
    botUsername: "CodexBridgeBot",
    sendMessage: async (payload) => {
      harness.sent.push(payload);
      return {};
    },
    deps: {
      prepareChatRequest: async (request) => {
        calls.push(["prepare", request.channel, request.externalUserId, request.content]);
        return {
          ok: true,
          user: { id: "telegram:111" },
          run: {
            runId: "run_tg_1",
            userId: "telegram:111",
          },
          charged: {
            costSource: "daily_free",
            charged: 1,
          },
          policy: { source: "fixture" },
        };
      },
      runPreparedTelegramCodexTurn: async (request) => {
        calls.push(["run", request.runRecord.runId, request.promptText, request.activeLabel]);
        await request.onRunning?.();
        await request.onSessionRef?.("thread_tg_1");
        return {
          ok: true,
          messageText: "telegram done",
          cliSessionRef: "thread_tg_1",
        };
      },
      appendConversationLogEvent: async (payload) => {
        harness.logs.push(payload);
      },
    },
  });

  assert.equal(result.action, "completed");
  assert.equal(result.envelope.chatType, "direct");
  assert.deepEqual(calls.map((call) => call[0]), ["prepare", "run"]);
  assert.equal(calls[0][3], "hello codexbridge");
  assert.equal(harness.sent.length, 2);
  assert.match(harness.sent[0].text, /Running Codex/);
  assert.equal(harness.sent[1].text, "telegram done");
  assert.deepEqual(harness.logs.map((item) => item.direction), ["input", "output"]);
  assert.equal(harness.logs[1].metadata.ok, true);

  const routerState = JSON.parse(await readFile(harness.routerStatePath, "utf8"));
  const session = Object.values(routerState.sessions).find((item) => item.sessionKey === "telegram:user:111");
  assert.equal(session.cliSessionRef, "thread_tg_1");
});

test("Telegram router state preserves legacy main session and active chat label", async () => {
  const {
    normalizeTelegramRouterState,
    ensureTelegramEnvelopeSession,
  } = await importFresh("../../src/telegram/message-flow.mjs");

  const state = normalizeTelegramRouterState({
    version: 1,
    chats: {
      "-1001": {
        activeSessionLabel: "main",
        updatedAt: "2026-06-25T00:00:00.000Z",
      },
    },
    sessions: {
      main: {
        label: "main",
        displayLabel: "legacy main",
        backend: "codex",
        cliSessionRef: "thread_main_legacy",
        isMain: true,
        createdAt: "2026-06-25T00:00:00.000Z",
        updatedAt: "2026-06-25T00:00:01.000Z",
      },
    },
  });

  assert.equal(state.sessions.main.cliSessionRef, "thread_main_legacy");
  assert.equal(state.sessions.main.displayLabel, "legacy main");
  assert.equal(state.chats["-1001"].activeSessionLabel, "main");

  const session = ensureTelegramEnvelopeSession(state, {
    channel: "telegram",
    chatType: "group",
    isGroup: true,
    chatId: "-1001",
    userId: "111",
  });

  assert.equal(session.sessionKey, "telegram:chat:-1001:user:111");
  assert.equal(state.sessions.main.cliSessionRef, "thread_main_legacy");
  assert.notEqual(state.chats["-1001"].activeSessionLabel, "main");
});

test("Telegram message flow requires explicit mention in groups", async () => {
  const { handleTelegramTextMessageFlow } = await importFresh("../../src/telegram/message-flow.mjs");
  const harness = await createHarness();
  const message = await readFixture("group-mention.json");
  message.text = "summarize this";
  message.entities = [];

  const result = await handleTelegramTextMessageFlow({
    message,
    botHome: harness.botHome,
    routerStatePath: harness.routerStatePath,
    botUsername: "CodexBridgeBot",
    sendMessage: async (payload) => {
      harness.sent.push(payload);
      return {};
    },
  });

  assert.deepEqual(result, { action: "ignored", reason: "mention_required" });
  assert.deepEqual(harness.sent, []);
});

test("Telegram message flow strips group mention before prepare", async () => {
  const { handleTelegramTextMessageFlow } = await importFresh("../../src/telegram/message-flow.mjs");
  const harness = await createHarness();
  const message = await readFixture("group-mention.json");
  const seen = [];

  const result = await handleTelegramTextMessageFlow({
    message,
    botHome: harness.botHome,
    routerStatePath: harness.routerStatePath,
    botUsername: "CodexBridgeBot",
    sendMessage: async (payload) => {
      harness.sent.push(payload);
      return {};
    },
    deps: {
      prepareChatRequest: async (request) => {
        seen.push(request);
        return {
          ok: true,
          user: { id: "telegram:111" },
          run: { runId: "run_tg_group", userId: "telegram:111" },
          charged: { costSource: "daily_free", charged: 1 },
          policy: {},
        };
      },
      runPreparedTelegramCodexTurn: async (request) => {
        await request.onRunning?.();
        return {
          ok: true,
          messageText: "group done",
        };
      },
    },
  });

  assert.equal(result.action, "completed");
  assert.equal(result.envelope.chatType, "group");
  assert.equal(seen[0].content, "summarize this");
  assert.equal(seen[0].envelope.explicitlyMentionedBot, true);
  assert.equal(harness.sent.at(-1).text, "group done");
});

test("Telegram message flow replies with failed output and writes output log", async () => {
  const { handleTelegramTextMessageFlow } = await importFresh("../../src/telegram/message-flow.mjs");
  const harness = await createHarness();
  const message = await readFixture("private-message.json");

  const result = await handleTelegramTextMessageFlow({
    message,
    botHome: harness.botHome,
    routerStatePath: harness.routerStatePath,
    sendMessage: async (payload) => {
      harness.sent.push(payload);
      return {};
    },
    deps: {
      prepareChatRequest: async () => ({
        ok: true,
        user: { id: "telegram:111" },
        run: { runId: "run_tg_failed", userId: "telegram:111" },
        charged: { costSource: "paid_credit", charged: 1 },
        policy: {},
      }),
      runPreparedTelegramCodexTurn: async (request) => {
        await request.onRunning?.();
        return {
          ok: false,
          errorText: "telegram agent failed",
        };
      },
      appendConversationLogEvent: async (payload) => {
        harness.logs.push(payload);
      },
    },
  });

  assert.equal(result.action, "failed");
  assert.equal(harness.sent.length, 2);
  assert.match(harness.sent[1].text, /telegram agent failed/);
  assert.equal(harness.logs.at(-1).direction, "output");
  assert.equal(harness.logs.at(-1).metadata.ok, false);
});
