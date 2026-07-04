import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { importFresh } from "../helpers/module.js";

const FIXTURES = path.resolve("test/fixtures/feishu");

async function readFixture(filename) {
  return JSON.parse(await readFile(path.join(FIXTURES, filename), "utf8"));
}

test("Feishu event gateway remembers processed message ids without mutating input", async () => {
  const { rememberProcessedFeishuMessage, hasProcessedFeishuMessage } = await importFresh("../../src/feishu/event-gateway.mjs");
  const state = { version: 1, processedMessageIds: ["a"] };
  const next = rememberProcessedFeishuMessage(state, "b");

  assert.deepEqual(state.processedMessageIds, ["a"]);
  assert.deepEqual(next.processedMessageIds, ["a", "b"]);
  assert.equal(hasProcessedFeishuMessage(next, "b"), true);
});

test("Feishu event gateway classifies direct text events for processing", async () => {
  const { classifyFeishuMessageEvent } = await importFresh("../../src/feishu/event-gateway.mjs");
  const event = await readFixture("text-message-private.json");

  const result = classifyFeishuMessageEvent({
    event,
    routerState: { processedMessageIds: [] },
    botIdentity: { mentionNames: new Set(["codexbridge"]) },
    normalizeIncomingText: (text) => text,
  });

  assert.equal(result.action, "process_text");
  assert.equal(result.chatId, "oc_private_fixture");
  assert.equal(result.messageId, "om_private_fixture");
  assert.equal(result.text, "hello codexbridge");
  assert.equal(result.explicitlyMentionedBot, true);
  assert.deepEqual(result.routerState.processedMessageIds, ["om_private_fixture"]);
});

test("Feishu event gateway ignores duplicate and group no-mention messages", async () => {
  const { classifyFeishuMessageEvent } = await importFresh("../../src/feishu/event-gateway.mjs");
  const duplicateEvent = await readFixture("text-message-private.json");
  const groupEvent = await readFixture("text-message-group-no-mention.json");

  const duplicate = classifyFeishuMessageEvent({
    event: duplicateEvent,
    routerState: { processedMessageIds: ["om_private_fixture"] },
  });
  const noMention = classifyFeishuMessageEvent({
    event: groupEvent,
    routerState: { processedMessageIds: [] },
    botIdentity: { mentionNames: new Set(["codexbridge"]) },
    requireExplicitMention: true,
    normalizeIncomingText: (text) => text,
  });

  assert.equal(duplicate.action, "ignore");
  assert.equal(duplicate.reason, "duplicate_message");
  assert.equal(noMention.action, "ignore");
  assert.equal(noMention.reason, "mention_required");
});

test("Feishu event gateway classifies non-text user messages as unsupported", async () => {
  const { classifyFeishuMessageEvent } = await importFresh("../../src/feishu/event-gateway.mjs");
  const event = await readFixture("unsupported-file-message.json");

  const result = classifyFeishuMessageEvent({
    event,
    routerState: { processedMessageIds: [] },
  });

  assert.equal(result.action, "unsupported_payload");
  assert.equal(result.reason, "unsupported_message_type");
  assert.deepEqual(result.routerState.processedMessageIds, ["om_file_fixture"]);
});
