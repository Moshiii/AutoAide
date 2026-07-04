import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { importFresh, withTempHome } from "../helpers/module.js";

const FEISHU_FIXTURES = path.resolve("test/fixtures/feishu");
const TELEGRAM_FIXTURES = path.resolve("test/fixtures/telegram");
const CODEX_FIXTURES = path.resolve("test/fixtures/codex");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readNdjson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function publicEnvelope(envelope) {
  return {
    channel: envelope.channel,
    chatType: envelope.chatType,
    chatId: envelope.chatId,
    userId: envelope.userId,
    messageId: envelope.messageId,
    isDirect: envelope.isDirect,
    isGroup: envelope.isGroup,
    explicitlyMentionedBot: envelope.explicitlyMentionedBot,
    text: envelope.text,
  };
}

function publicAgentEvent(event) {
  return omitUndefined({
    id: event.id || undefined,
    type: event.type,
    runId: event.runId || undefined,
    sessionKey: event.sessionKey || undefined,
    provider: event.provider,
    payload: Object.fromEntries(Object.entries(event.payload || {})
      .filter(([key]) => key !== "raw")),
  });
}

function omitUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

test("Feishu message fixtures match expected classification and envelope snapshots", async () => {
  const { classifyFeishuMessageEvent } = await importFresh("../../src/feishu/event-gateway.mjs");
  const { translateFeishuMessageEvent } = await importFresh("../../src/feishu/message-translator.mjs");
  const cases = [
    "text-message-private",
    "text-message-group-mention",
    "text-message-group-no-mention",
    "unsupported-file-message",
  ];

  for (const name of cases) {
    const event = await readJson(path.join(FEISHU_FIXTURES, `${name}.json`));
    const expected = await readJson(path.join(FEISHU_FIXTURES, `${name}.expected.json`));
    const text = expected.envelope.text ? event.message.chat_type === "p2p"
      ? expected.envelope.text
      : expected.envelope.text
      : "";
    const classification = classifyFeishuMessageEvent({
      event,
      routerState: { processedMessageIds: [] },
      botIdentity: { mentionNames: new Set(["codexbridge"]) },
      requireExplicitMention: true,
      normalizeIncomingText: () => text,
    });
    const envelope = translateFeishuMessageEvent(event, {
      explicitlyMentionedBot: expected.envelope.explicitlyMentionedBot,
      text: expected.envelope.text,
    });

    assert.deepEqual(omitUndefined({
      action: classification.action,
      reason: classification.reason,
      messageId: classification.messageId,
      chatId: classification.chatId,
      text: classification.text,
      explicitlyMentionedBot: classification.explicitlyMentionedBot,
      processedMessageIds: classification.routerState?.processedMessageIds,
    }), expected.classification);
    assert.deepEqual(publicEnvelope(envelope), expected.envelope);
  }
});

test("Feishu card action fixtures match expected callback snapshots", async () => {
  const { normalizeFeishuCardAction, extractFeishuCardActionUserId } = await importFresh("../../src/feishu/callback-router.mjs");
  for (const name of ["card-action-allow", "card-action-deny"]) {
    const event = await readJson(path.join(FEISHU_FIXTURES, `${name}.json`));
    const expected = await readJson(path.join(FEISHU_FIXTURES, `${name}.expected.json`));
    const normalized = normalizeFeishuCardAction(event);

    assert.deepEqual({
      action: normalized.action,
      runId: normalized.runId,
      actionId: normalized.actionId,
      userId: normalized.userId,
      operatorOpenId: extractFeishuCardActionUserId(event),
      nonce: normalized.nonce,
    }, expected.callbackAction);
  }
});

test("Telegram fixtures match expected envelope snapshots", async () => {
  await withTempHome(async () => {
    const { extractBotMention, stripExplicitBotMention } = await importFresh("../../plugins/telegram-codex/telegram-codex-bridge.mjs");
    const { normalizeTelegramEnvelope } = await importFresh("../../src/channels/envelope.mjs");
    for (const name of ["private-message", "group-mention"]) {
      const message = await readJson(path.join(TELEGRAM_FIXTURES, `${name}.json`));
      const expected = await readJson(path.join(TELEGRAM_FIXTURES, `${name}.expected.json`));
      const mention = extractBotMention(message.text, message.entities || [], "CodexBridgeBot");
      const text = mention
        ? stripExplicitBotMention(message.text, mention)
        : message.text;
      const envelope = normalizeTelegramEnvelope(message, {
        explicitlyMentionedBot: Boolean(mention),
        text,
      });

      if (expected.mention) {
        assert.deepEqual({
          offset: mention.offset,
          length: mention.length,
          text: mention.text,
          strippedText: text,
        }, expected.mention);
      }
      assert.deepEqual(publicEnvelope(envelope), expected.envelope);
    }
  });
});

test("Codex CLI fixtures match expected AgentEvent snapshots", async () => {
  const { normalizeCodexCliEvent } = await importFresh("../../src/agents/events.mjs");
  const cases = [
    ["thread-started", { runId: "run_1", sessionKey: "feishu:user:ou_fixture_user", createdAt: "2026-06-25T00:00:00.000Z" }],
    ["tool-call", { createdAt: "2026-06-25T00:00:00.000Z" }],
    ["command-exec", { createdAt: "2026-06-25T00:00:00.000Z" }],
    ["final-message", { createdAt: "2026-06-25T00:00:00.000Z" }],
  ];

  for (const [name, context] of cases) {
    const events = await readNdjson(path.join(CODEX_FIXTURES, `${name}.ndjson`));
    const expected = await readJson(path.join(CODEX_FIXTURES, `${name}.expected.json`));
    const normalized = events.map((event) => publicAgentEvent(normalizeCodexCliEvent(event, context)));

    assert.deepEqual(normalized, expected.events);
  }
});
