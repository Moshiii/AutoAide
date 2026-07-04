import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { importFresh, withTempHome } from "../helpers/module.js";

test("Feishu router state normalizes missing fields", async () => {
  const { normalizeFeishuRouterState } = await importFresh("../../src/feishu/router-state.mjs");

  assert.deepEqual(normalizeFeishuRouterState({}), {
    version: 1,
    chats: {},
    processedMessageIds: [],
  });
  assert.deepEqual(normalizeFeishuRouterState({
    chats: { a: { sessionKey: "a" } },
    processedMessageIds: ["m1"],
  }), {
    version: 1,
    chats: { a: { sessionKey: "a" } },
    processedMessageIds: ["m1"],
  });
});

test("Feishu router state preserves legacy chat and dedupe state", async () => {
  const { normalizeFeishuRouterState } = await importFresh("../../src/feishu/router-state.mjs");

  const state = normalizeFeishuRouterState({
    version: 1,
    chats: {
      "feishu:chat:oc_1:user:ou_1": {
        sessionKey: "feishu:chat:oc_1:user:ou_1",
        sessionLabel: "feishu-g-oc_1-u-ou_1",
        cliSessionRef: "thread_legacy",
        createdAt: "2026-06-25T00:00:00.000Z",
        updatedAt: "2026-06-25T00:00:01.000Z",
      },
    },
    processedMessageIds: ["om_legacy_1", "om_legacy_2"],
  });

  assert.equal(state.chats["feishu:chat:oc_1:user:ou_1"].cliSessionRef, "thread_legacy");
  assert.deepEqual(state.processedMessageIds, ["om_legacy_1", "om_legacy_2"]);
});

test("Feishu conversation state reuses legacy chat instead of changing session identity", async () => {
  const { ensureFeishuConversationState } = await importFresh("../../src/feishu/router-state.mjs");
  const state = {
    version: 1,
    chats: {
      "feishu:chat:oc_d70431726f2f3e0eb3c540609dc324fc:user:ou_1234567890": {
        sessionKey: "feishu:chat:oc_d70431726f2f3e0eb3c540609dc324fc:user:ou_1234567890",
        sessionLabel: "feishu-g-9dc324fc-u-34567890",
        cliSessionRef: "thread_legacy",
        createdAt: "2026-06-25T00:00:00.000Z",
        updatedAt: "2026-06-25T00:00:01.000Z",
      },
    },
    processedMessageIds: ["om_legacy"],
  };

  const chatState = ensureFeishuConversationState(state, {
    channel: "feishu",
    chatType: "group",
    isGroup: true,
    chatId: "oc_d70431726f2f3e0eb3c540609dc324fc",
    userId: "ou_1234567890",
  }, {
    now: "2026-06-25T00:01:00.000Z",
  });

  assert.equal(chatState.cliSessionRef, "thread_legacy");
  assert.equal(chatState.createdAt, "2026-06-25T00:00:00.000Z");
  assert.equal(state.processedMessageIds[0], "om_legacy");
});

test("Feishu router state reads and writes JSON files", async () => {
  await withTempHome(async (home) => {
    const { readFeishuRouterState, writeFeishuRouterState } = await importFresh("../../src/feishu/router-state.mjs");
    const filePath = path.join(home, "feishu", "router.json");

    assert.deepEqual(await readFeishuRouterState(filePath), {
      version: 1,
      chats: {},
      processedMessageIds: [],
    });

    await writeFeishuRouterState(filePath, {
      chats: { k: { sessionKey: "k" } },
      processedMessageIds: ["m1"],
    });

    assert.deepEqual(await readFeishuRouterState(filePath), {
      version: 1,
      chats: { k: { sessionKey: "k" } },
      processedMessageIds: ["m1"],
    });
  });
});

test("Feishu conversation state preserves existing session key contract", async () => {
  const { ensureFeishuConversationState } = await importFresh("../../src/feishu/router-state.mjs");
  const state = { version: 1, chats: {}, processedMessageIds: [] };
  const chatState = ensureFeishuConversationState(state, {
    channel: "feishu",
    chatType: "group",
    isGroup: true,
    chatId: "oc_d70431726f2f3e0eb3c540609dc324fc",
    userId: "ou_1234567890",
  }, {
    now: "2026-06-25T00:00:00.000Z",
  });

  assert.equal(chatState.sessionKey, "feishu:chat:oc_d70431726f2f3e0eb3c540609dc324fc:user:ou_1234567890");
  assert.equal(chatState.sessionLabel, "feishu-g-9dc324fc-u-34567890");
  assert.equal(chatState.createdAt, "2026-06-25T00:00:00.000Z");
});

test("Feishu CLI session sync preserves existing session ref", async () => {
  const { ensureFeishuCliSession } = await importFresh("../../src/feishu/router-state.mjs");
  const writes = [];
  const cliState = {
    sessions: {},
  };

  const result = await ensureFeishuCliSession("/tmp/bot", {
    sessionLabel: "feishu-u-123",
    cliSessionRef: "thread_1",
    createdAt: "2026-06-25T00:00:00.000Z",
  }, {
    now: "2026-06-25T00:00:01.000Z",
    readCliState: async () => cliState,
    writeCliState: async (next) => writes.push(JSON.parse(JSON.stringify(next))),
  });

  assert.equal(result.sessions["feishu-u-123"].cliSessionRef, "thread_1");
  assert.equal(result.sessions["feishu-u-123"].createdAt, "2026-06-25T00:00:00.000Z");
  assert.equal(result.sessions["feishu-u-123"].updatedAt, "2026-06-25T00:00:01.000Z");
  assert.equal(writes.length, 1);
});
