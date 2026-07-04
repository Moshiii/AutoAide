import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { importFresh } from "../helpers/module.js";

const NOW = "2026-01-02T03:04:05.000Z";
const LATER = "2026-01-02T03:05:06.000Z";

test("session catalog upserts envelopes without changing legacy session identity", async () => {
  const { resolveConversationIdentity } = await importFresh("../../src/session-routing.mjs");
  const { createSessionCatalog } = await importFresh("../../src/channels/session-catalog.mjs");
  const envelope = {
    channel: "feishu",
    chatType: "group",
    chatId: "oc_group_fixture",
    userId: "ou_fixture_user",
    isDirect: false,
    isGroup: true,
  };
  const legacy = resolveConversationIdentity(envelope);
  const catalog = createSessionCatalog({}, { now: () => NOW });

  const session = catalog.upsertFromEnvelope(envelope, {
    cliSessionRef: "codex-thread-1",
    metadata: { source: "fixture" },
  });

  assert.equal(session.sessionKey, legacy.sessionKey);
  assert.equal(session.sessionLabel, legacy.sessionLabel);
  assert.equal(session.channel, "feishu");
  assert.equal(session.chatType, "group");
  assert.equal(session.chatId, "oc_group_fixture");
  assert.equal(session.userId, "ou_fixture_user");
  assert.equal(session.cliSessionRef, "codex-thread-1");
  assert.deepEqual(session.metadata, { source: "fixture" });
  assert.equal(catalog.get(legacy.sessionKey), session);
  assert.equal(catalog.findByLabel(legacy.sessionLabel), session);
});

test("session catalog updates thread refs while preserving createdAt", async () => {
  const { createSessionCatalog } = await importFresh("../../src/channels/session-catalog.mjs");
  const catalog = createSessionCatalog({}, { now: () => NOW });
  const session = catalog.upsertFromEnvelope({
    channel: "telegram",
    chatType: "direct",
    chatId: "123",
    userId: "456",
    isDirect: true,
  });

  const updated = catalog.updateSession(session.sessionKey, {
    cliSessionRef: "codex-thread-2",
    threadRef: "thread-ref-2",
    metadata: { activeLabel: "main" },
    updatedAt: LATER,
  });

  assert.equal(updated.createdAt, NOW);
  assert.equal(updated.updatedAt, LATER);
  assert.equal(updated.cliSessionRef, "codex-thread-2");
  assert.equal(updated.threadRef, "thread-ref-2");
  assert.deepEqual(updated.metadata, { activeLabel: "main" });
});

test("session catalog list filters by channel, chat, and user", async () => {
  const { createSessionCatalog } = await importFresh("../../src/channels/session-catalog.mjs");
  const catalog = createSessionCatalog({}, { now: () => NOW });

  catalog.upsertFromEnvelope({ channel: "feishu", chatType: "direct", chatId: "d1", userId: "u1", isDirect: true });
  catalog.upsertFromEnvelope({ channel: "feishu", chatType: "group", chatId: "g1", userId: "u1", isGroup: true });
  catalog.upsertFromEnvelope({ channel: "telegram", chatType: "direct", chatId: "d2", userId: "u2", isDirect: true });

  assert.deepEqual(catalog.list({ channel: "feishu" }).map((item) => item.channel), ["feishu", "feishu"]);
  assert.deepEqual(catalog.list({ chatId: "g1" }).map((item) => item.chatId), ["g1"]);
  assert.deepEqual(catalog.list({ userId: "u2" }).map((item) => item.channel), ["telegram"]);
});

test("session catalog normalizes legacy snapshots", async () => {
  const { normalizeSessionCatalogState } = await importFresh("../../src/channels/session-catalog.mjs");

  const normalized = normalizeSessionCatalogState({
    sessions: {
      "feishu:user:ou_1": {
        sessionLabel: "feishu-u-ou-1",
        channel: "feishu",
        chatType: "direct",
        userId: "ou_1",
        createdAt: NOW,
      },
    },
  });

  assert.equal(normalized.version, 1);
  assert.equal(normalized.sessions["feishu:user:ou_1"].sessionKey, "feishu:user:ou_1");
  assert.equal(normalized.sessions["feishu:user:ou_1"].updatedAt, NOW);
  assert.equal(normalized.sessions["feishu:user:ou_1"].cliSessionRef, null);
});

test("session catalog reads missing or malformed files as an empty catalog", async () => {
  const { readSessionCatalogState } = await importFresh("../../src/channels/session-catalog.mjs");
  const dir = await mkdtemp(path.join(tmpdir(), "codexbridge-session-catalog-"));
  const missingPath = path.join(dir, "missing.json");
  const malformedPath = path.join(dir, "malformed.json");
  await writeFile(malformedPath, "{bad json", "utf8");

  assert.deepEqual(await readSessionCatalogState(missingPath), { version: 1, sessions: {} });
  assert.deepEqual(await readSessionCatalogState(malformedPath), { version: 1, sessions: {} });
});

test("session catalog persists normalized old/new session snapshots", async () => {
  const {
    readSessionCatalog,
    readSessionCatalogState,
    writeSessionCatalogState,
  } = await importFresh("../../src/channels/session-catalog.mjs");
  const dir = await mkdtemp(path.join(tmpdir(), "codexbridge-session-catalog-"));
  const filePath = path.join(dir, "channels", "sessions.json");
  const legacyState = {
    sessions: {
      "telegram:user:456": {
        sessionLabel: "telegram-u-456",
        channel: "telegram",
        chatType: "direct",
        chatId: "123",
        userId: "456",
        cliSessionRef: "thread_legacy",
        createdAt: NOW,
      },
    },
  };

  const written = await writeSessionCatalogState(filePath, legacyState);
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  const readBack = await readSessionCatalogState(filePath);
  const catalog = await readSessionCatalog(filePath, { now: () => LATER });

  assert.equal(written.version, 1);
  assert.equal(raw.version, 1);
  assert.equal(readBack.sessions["telegram:user:456"].cliSessionRef, "thread_legacy");
  assert.equal(readBack.sessions["telegram:user:456"].updatedAt, NOW);
  assert.equal(catalog.get("telegram:user:456").sessionLabel, "telegram-u-456");
});

test("session catalog rejects missing session identity", async () => {
  const { createSessionCatalog } = await importFresh("../../src/channels/session-catalog.mjs");
  const catalog = createSessionCatalog();

  assert.throws(() => catalog.upsertFromEnvelope({ channel: "feishu", chatType: "direct" }), /without userId/);
  assert.throws(() => catalog.get(""), /non-empty session key/);
  assert.equal(catalog.findByLabel(""), null);
  assert.equal(catalog.updateSession("missing", { cliSessionRef: "x" }), null);
});
