import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { importFresh } from "../helpers/module.js";

const FEISHU_FIXTURES = path.resolve("test/fixtures/feishu");

async function readFixture(filename) {
  return JSON.parse(await readFile(path.join(FEISHU_FIXTURES, filename), "utf8"));
}

test("Feishu message translator preserves existing envelope contract", async () => {
  const { normalizeFeishuEnvelope } = await importFresh("../../src/channel-envelope.mjs");
  const { translateFeishuMessageEvent } = await importFresh("../../src/feishu/message-translator.mjs");
  const event = await readFixture("text-message-group-mention.json");
  const options = {
    text: "@CodexBridge summarize this repo",
    explicitlyMentionedBot: true,
  };

  assert.deepEqual(translateFeishuMessageEvent(event, options), normalizeFeishuEnvelope(event, options));
});

test("Feishu fixture envelopes cover direct, mentioned group, and ignored group input", async () => {
  const { translateFeishuMessageEvent } = await importFresh("../../src/feishu/message-translator.mjs");
  const direct = translateFeishuMessageEvent(await readFixture("text-message-private.json"), {
    text: "hello codexbridge",
  });
  const mentionedGroup = translateFeishuMessageEvent(await readFixture("text-message-group-mention.json"), {
    text: "@CodexBridge summarize this repo",
    explicitlyMentionedBot: true,
  });
  const noMentionGroup = translateFeishuMessageEvent(await readFixture("text-message-group-no-mention.json"), {
    text: "summarize this repo",
    explicitlyMentionedBot: false,
  });

  assert.equal(direct.chatType, "direct");
  assert.equal(direct.isDirect, true);
  assert.equal(direct.explicitlyMentionedBot, true);
  assert.equal(mentionedGroup.chatType, "group");
  assert.equal(mentionedGroup.explicitlyMentionedBot, true);
  assert.equal(noMentionGroup.chatType, "group");
  assert.equal(noMentionGroup.explicitlyMentionedBot, false);
});

test("channel scope resolver preserves existing session identity contract", async () => {
  const { resolveConversationIdentity } = await importFresh("../../src/session-routing.mjs");
  const { resolveChannelScope } = await importFresh("../../src/channels/scope-resolver.mjs");
  const envelope = {
    channel: "feishu",
    chatType: "group",
    chatId: "oc_group_fixture",
    userId: "ou_fixture_user",
    isDirect: false,
    isGroup: true,
  };

  const oldIdentity = resolveConversationIdentity(envelope);
  const scope = resolveChannelScope(envelope);

  assert.equal(scope.sessionKey, oldIdentity.sessionKey);
  assert.equal(scope.sessionLabel, oldIdentity.sessionLabel);
  assert.equal(scope.channel, "feishu");
  assert.equal(scope.chatType, "group");
  assert.equal(scope.isGroup, true);
});
