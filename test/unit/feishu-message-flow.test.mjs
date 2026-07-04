import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { importFresh } from "../helpers/module.js";

const FIXTURES = path.resolve("test/fixtures/feishu");

async function readFixture(filename) {
  return JSON.parse(await readFile(path.join(FIXTURES, filename), "utf8"));
}

async function createFlowHarness() {
  const root = await mkdtemp(path.join(os.tmpdir(), "codexbridge-feishu-flow-"));
  return {
    botHome: path.join(root, "bot"),
    routerStatePath: path.join(root, "feishu", "router.json"),
    sent: [],
    logs: [],
    sendText: async (payload) => {
      const response = {
        data: {
          sender: {
            sender_id: {
              open_id: "ou_bot_fixture",
            },
          },
        },
      };
      payload.response = response;
      return response;
    },
  };
}

test("Feishu message flow runs private text through prepare, runner, logs, and replies", async () => {
  const { handleFeishuTextMessageFlow } = await importFresh("../../src/feishu/message-flow.mjs");
  const harness = await createFlowHarness();
  const event = await readFixture("text-message-private.json");
  const calls = [];
  const botIdentity = { mentionNames: new Set(["codexbridge"]) };

  const result = await handleFeishuTextMessageFlow({
    event,
    botHome: harness.botHome,
    routerStatePath: harness.routerStatePath,
    botIdentity,
    sendText: async (payload) => {
      harness.sent.push(payload);
      return harness.sendText(payload);
    },
    deps: {
      prepareChatRequest: async (request) => {
        calls.push(["prepare", request.channel, request.externalUserId, request.content]);
        return {
          ok: true,
          user: { id: "feishu:ou_fixture_user" },
          run: {
            runId: "run_flow_1",
            userId: "feishu:ou_fixture_user",
          },
          charged: {
            costSource: "daily_free",
            charged: 1,
          },
          policy: { source: "fixture" },
        };
      },
      runPreparedFeishuCodexTurn: async (request) => {
        calls.push(["run", request.runRecord.runId, request.promptText, request.chatState.sessionKey]);
        await request.onRunning?.();
        return {
          ok: true,
          outputText: "flow done",
          cliSessionRef: "thread_flow_1",
        };
      },
      appendConversationLogEvent: async (payload) => {
        harness.logs.push(payload);
      },
    },
  });

  assert.equal(result.action, "completed");
  assert.equal(result.envelope.chatType, "direct");
  assert.equal(botIdentity.openId, "ou_bot_fixture");
  assert.deepEqual(calls.map((call) => call[0]), ["prepare", "run"]);
  assert.match(calls[0][3], /hello codexbridge/);
  assert.equal(harness.sent.length, 2);
  assert.match(harness.sent[0].text, /Running Codex/);
  assert.equal(harness.sent[1].text, "flow done");
  assert.deepEqual(harness.logs.map((item) => item.direction), ["input", "output"]);
  assert.equal(harness.logs[1].metadata.ok, true);
});

test("Feishu message flow ignores group messages without mention and persists dedupe state", async () => {
  const { handleFeishuTextMessageFlow } = await importFresh("../../src/feishu/message-flow.mjs");
  const harness = await createFlowHarness();
  const event = await readFixture("text-message-group-no-mention.json");

  const result = await handleFeishuTextMessageFlow({
    event,
    botHome: harness.botHome,
    routerStatePath: harness.routerStatePath,
    botIdentity: { mentionNames: new Set(["codexbridge"]) },
    sendText: async (payload) => {
      harness.sent.push(payload);
      return {};
    },
  });

  assert.deepEqual(result, { action: "ignored", reason: "mention_required" });
  assert.deepEqual(harness.sent, []);
  const routerState = JSON.parse(await readFile(harness.routerStatePath, "utf8"));
  assert.deepEqual(routerState.processedMessageIds, ["om_group_no_mention_fixture"]);
});

test("Feishu message flow replies to unsupported payloads without preparing a run", async () => {
  const { handleFeishuTextMessageFlow } = await importFresh("../../src/feishu/message-flow.mjs");
  const harness = await createFlowHarness();
  const event = await readFixture("unsupported-file-message.json");
  let prepared = false;

  const result = await handleFeishuTextMessageFlow({
    event,
    botHome: harness.botHome,
    routerStatePath: harness.routerStatePath,
    sendText: async (payload) => {
      harness.sent.push(payload);
      return {};
    },
    deps: {
      prepareChatRequest: async () => {
        prepared = true;
      },
    },
  });

  assert.equal(result.action, "unsupported_payload");
  assert.equal(prepared, false);
  assert.equal(harness.sent.length, 1);
  assert.match(harness.sent[0].text, /plain text messages/);
  assert.equal(harness.sent[0].replyToMessageId, "om_file_fixture");
});

test("Feishu message flow replies with failed output and writes output log", async () => {
  const { handleFeishuTextMessageFlow } = await importFresh("../../src/feishu/message-flow.mjs");
  const harness = await createFlowHarness();
  const event = await readFixture("text-message-private.json");

  const result = await handleFeishuTextMessageFlow({
    event,
    botHome: harness.botHome,
    routerStatePath: harness.routerStatePath,
    sendText: async (payload) => {
      harness.sent.push(payload);
      return {};
    },
    deps: {
      prepareChatRequest: async () => ({
        ok: true,
        user: { id: "feishu:ou_fixture_user" },
        run: {
          runId: "run_flow_failed",
          userId: "feishu:ou_fixture_user",
        },
        charged: {
          costSource: "paid_credit",
          charged: 1,
        },
        policy: {},
      }),
      runPreparedFeishuCodexTurn: async (request) => {
        await request.onRunning?.();
        return {
          ok: false,
          errorText: "agent failed",
        };
      },
      appendConversationLogEvent: async (payload) => {
        harness.logs.push(payload);
      },
    },
  });

  assert.equal(result.action, "failed");
  assert.equal(harness.sent.length, 2);
  assert.match(harness.sent[1].text, /agent failed/);
  assert.equal(harness.logs.at(-1).direction, "output");
  assert.equal(harness.logs.at(-1).metadata.ok, false);
});
