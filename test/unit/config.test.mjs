import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { importFresh, withTempHome } from "../helpers/module.js";

test("ensureCodexBridgeHome creates runtime directories", async () => {
  await withTempHome(async (tempHome) => {
    const config = await importFresh("../../src/config.mjs");

    await config.ensureCodexBridgeHome();

    await Promise.all([
      access(path.join(tempHome, "control")),
      access(path.join(tempHome, "bots", "default", "workspace")),
      access(path.join(tempHome, "bots", "default", "memory")),
      access(path.join(tempHome, "logs")),
      access(path.join(tempHome, "bots", "default", "telegram")),
      access(path.join(tempHome, "bots", "default", "feishu")),
    ]);
  });
});

test("readConfig returns defaults when config is missing", async () => {
  await withTempHome(async () => {
    const config = await importFresh("../../src/config.mjs");
    const value = await config.readConfig();

    assert.equal(value.runtime.model, "gpt-5.4");
    assert.equal(value.runtime.maxRunMs, 30 * 60 * 1000);
    assert.equal(value.runtime.maxOutputBytes, 2 * 1024 * 1024);
    assert.deepEqual(value.runtime.isolation, {
      mode: "none",
      verified: false,
      notes: "",
      lastProbe: null,
    });
    assert.deepEqual(value.storage, {
      provider: "json",
    });
    assert.equal(value.ownerUserId, "");
    assert.deepEqual(value.adminUserIds, []);
    assert.deepEqual(value.channels.telegram, {
      enabled: false,
      botToken: "",
      botUsername: "",
      metadata: {
        chats: {},
        users: {},
      },
      private: {
        allowedChatIds: [],
      },
      groups: {
        allowedChatIds: [],
        allowedUserIds: [],
        requireExplicitMention: true,
      },
    });
    assert.deepEqual(value.channels.feishu, {
      enabled: false,
      appId: "",
      appSecret: "",
      verificationToken: "",
      encryptKey: "",
      defaultReceiveIdType: "chat_id",
      requireExplicitMention: true,
      botMentionNames: [],
      testAudience: {
        userIds: [],
        chatIds: [],
      },
      setup: {
        botCapabilityEnabled: false,
        messageEventSubscribed: false,
        tenantInstalled: false,
        visibilityConfirmed: false,
        testGroupReady: false,
      },
      documentHandling: {
        enabled: false,
        defaultOutput: "both",
        allowAttachmentInput: true,
        allowCloudDocLinks: true,
      },
      callback: {
        enabled: false,
        host: "127.0.0.1",
        port: null,
        path: "/webhook/card",
        signingSecret: "",
      },
      metadata: {
        chats: {},
        users: {},
      },
    });
  });
});

test("normalizeBotConfig drops unused runtime backend, skills, and schedule stubs", async () => {
  await withTempHome(async () => {
    const config = await importFresh("../../src/config.mjs");
    const normalized = config.normalizeBotConfig({
      channels: {
        telegram: {
          enabled: false,
        },
      },
      runtime: {
        model: "gpt-5.4-mini",
        maxRunMs: 1234,
        maxOutputBytes: 5678,
        isolation: {
          mode: "container",
          verified: true,
          notes: "verified with deny-write probe",
          lastProbe: {
            status: "pass",
            checkedAt: "2026-06-25T00:00:00.000Z",
            mode: "container",
            workspaceRoot: "/tmp/workspace",
            forbiddenPath: "/tmp/forbidden",
            summary: "passed",
          },
        },
        backend: "codex",
      },
      skills: {
        enabled: ["demo"],
        isolatedStore: false,
      },
      schedule: {
        enabled: false,
      },
    });

    assert.equal(normalized.runtime.model, "gpt-5.4-mini");
    assert.equal(normalized.runtime.maxRunMs, 1234);
    assert.equal(normalized.runtime.maxOutputBytes, 5678);
    assert.deepEqual(normalized.runtime.isolation, {
      mode: "container",
      verified: true,
      notes: "verified with deny-write probe",
      lastProbe: {
        status: "pass",
        checkedAt: "2026-06-25T00:00:00.000Z",
        mode: "container",
        workspaceRoot: "/tmp/workspace",
        forbiddenPath: "/tmp/forbidden",
        summary: "passed",
      },
    });
    assert.equal(normalized.enabled, false);
    assert.equal(normalized.ownerUserId, "");
    assert.deepEqual(normalized.adminUserIds, []);
    assert.equal("backend" in normalized.runtime, false);
    assert.equal("skills" in normalized, false);
    assert.equal("schedule" in normalized, false);
  });
});

test("normalizeBotConfig normalizes runtime process limits", async () => {
  await withTempHome(async () => {
    const config = await importFresh("../../src/config.mjs");

    const defaults = config.normalizeBotConfig({});
    assert.equal(defaults.runtime.maxRunMs, 30 * 60 * 1000);
    assert.equal(defaults.runtime.maxOutputBytes, 2 * 1024 * 1024);

    const normalized = config.normalizeBotConfig({
      runtime: {
        model: "gpt-5.4-mini",
        maxRunMs: -1,
        maxOutputBytes: "not-a-number",
      },
    });
    assert.equal(normalized.runtime.maxRunMs, 30 * 60 * 1000);
    assert.equal(normalized.runtime.maxOutputBytes, 2 * 1024 * 1024);
  });
});

test("normalizeBotConfig normalizes runtime isolation readiness", async () => {
  await withTempHome(async () => {
    const config = await importFresh("../../src/config.mjs");

    const defaults = config.normalizeBotConfig({});
    assert.deepEqual(defaults.runtime.isolation, {
      mode: "none",
      verified: false,
      notes: "",
      lastProbe: null,
    });

    const normalized = config.normalizeBotConfig({
      runtime: {
        isolation: {
          mode: "MICROVM",
          verified: 1,
          notes: "  firecracker worker probe passed  ",
          lastProbe: {
            status: "pass",
            checkedAt: "2026-06-25T00:00:00.000Z",
            mode: "microvm",
            workspaceRoot: " /worker/workspace ",
            forbiddenPath: " /host ",
            summary: " blocked host access ",
          },
        },
      },
    });
    assert.deepEqual(normalized.runtime.isolation, {
      mode: "microvm",
      verified: true,
      notes: "firecracker worker probe passed",
      lastProbe: {
        status: "pass",
        checkedAt: "2026-06-25T00:00:00.000Z",
        mode: "microvm",
        workspaceRoot: "/worker/workspace",
        forbiddenPath: "/host",
        summary: "blocked host access",
      },
    });

    const invalid = config.normalizeBotConfig({
      runtime: {
        isolation: {
          mode: "ssh",
          verified: false,
          notes: 123,
        },
      },
    });
    assert.deepEqual(invalid.runtime.isolation, defaults.runtime.isolation);
  });
});

test("normalizeBotConfig normalizes storage provider", async () => {
  await withTempHome(async () => {
    const config = await importFresh("../../src/config.mjs");

    assert.equal(config.normalizeBotConfig({ storage: { provider: "sqlite" } }).storage.provider, "sqlite");
    assert.equal(config.normalizeBotConfig({ storage: { provider: "unknown" } }).storage.provider, "json");
    assert.equal(config.normalizeBotConfig({}).storage.provider, "json");
  });
});

test("normalizeBotConfig normalizes owner and admin ids", async () => {
  await withTempHome(async () => {
    const config = await importFresh("../../src/config.mjs");
    const normalized = config.normalizeBotConfig({
      ownerUserId: " 123 ",
      adminUserIds: [" 123 ", "", "456", null],
    });

    assert.equal(normalized.ownerUserId, "123");
    assert.deepEqual(normalized.adminUserIds, ["123", "456"]);
  });
});

test("writeConfig persists config and readConfig reads it back", async () => {
  await withTempHome(async (tempHome) => {
    const config = await importFresh("../../src/config.mjs");
    const next = {
      runtime: {
        model: "gpt-5.4-mini",
        maxRunMs: 4321,
        maxOutputBytes: 8765,
        isolation: {
          mode: "system_user",
          verified: true,
          notes: "dedicated os user",
          lastProbe: {
            status: "pass",
            checkedAt: "2026-06-25T00:00:00.000Z",
            mode: "system_user",
            workspaceRoot: "/tmp/workspace",
            forbiddenPath: "/tmp/forbidden",
            summary: "passed",
          },
        },
        backend: "codex",
      },
      channels: {
        telegram: {
          enabled: true,
          botToken: "token-123",
          botUsername: "demo_bot",
          private: {
            allowedChatIds: ["1", "2"],
          },
          groups: {
            allowedChatIds: ["3"],
            allowedUserIds: ["9"],
            requireExplicitMention: true,
          },
        },
      },
    };

    await config.writeConfig(next);

    const persisted = await config.readConfig();
    assert.equal(persisted.runtime.model, "gpt-5.4-mini");
    assert.equal(persisted.runtime.maxRunMs, 4321);
    assert.equal(persisted.runtime.maxOutputBytes, 8765);
    assert.deepEqual(persisted.runtime.isolation, {
      mode: "system_user",
      verified: true,
      notes: "dedicated os user",
      lastProbe: {
        status: "pass",
        checkedAt: "2026-06-25T00:00:00.000Z",
        mode: "system_user",
        workspaceRoot: "/tmp/workspace",
        forbiddenPath: "/tmp/forbidden",
        summary: "passed",
      },
    });
    assert.equal(persisted.storage.provider, "json");
    assert.deepEqual(persisted.channels.telegram.private.allowedChatIds, ["1", "2"]);
    assert.deepEqual(persisted.channels.telegram.groups.allowedChatIds, ["3"]);
    const raw = JSON.parse(await readFile(path.join(tempHome, "bots", "default", "config.json"), "utf8"));
    assert.equal(raw.runtime.model, "gpt-5.4-mini");
    assert.equal(raw.runtime.maxRunMs, 4321);
    assert.equal(raw.runtime.maxOutputBytes, 8765);
    assert.deepEqual(raw.runtime.isolation, {
      mode: "system_user",
      verified: true,
      notes: "dedicated os user",
      lastProbe: {
        status: "pass",
        checkedAt: "2026-06-25T00:00:00.000Z",
        mode: "system_user",
        workspaceRoot: "/tmp/workspace",
        forbiddenPath: "/tmp/forbidden",
        summary: "passed",
      },
    });
    assert.equal("model" in raw, false);
    assert.equal("backend" in raw.runtime, false);
    assert.equal("skills" in raw, false);
    assert.equal("schedule" in raw, false);
  });
});

test("readCliState creates a valid default main session", async () => {
  await withTempHome(async () => {
    const config = await importFresh("../../src/config.mjs");
    const state = await config.readCliState();

    assert.equal(state.activeSessionLabel, "main");
    assert.equal(state.sessions.main.label, "main");
    assert.equal(state.sessions.main.cliSessionRef, null);
    assert.match(state.sessions.main.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test("readCliState repairs missing main session and invalid active session", async () => {
  await withTempHome(async () => {
    const config = await importFresh("../../src/config.mjs");
    await config.writeCliState({
      version: 1,
      sessions: {
        other: {
          label: "other",
          cliSessionRef: null,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      },
      activeSessionLabel: "missing",
    });

    const state = await config.readCliState();
    assert.equal(state.activeSessionLabel, "main");
    assert.equal(state.sessions.main.label, "main");
    assert.equal(state.sessions.other.label, "other");
  });
});

test("readBootstrapState returns default bootstrap state", async () => {
  await withTempHome(async () => {
    const config = await importFresh("../../src/config.mjs");
    const state = await config.readBootstrapState();

    assert.deepEqual(state, {
      version: 1,
      completed: false,
      completedAt: null,
      lastSeededAt: null,
    });
  });
});

test("active bot state defaults to default and can be updated", async () => {
  await withTempHome(async () => {
    const config = await importFresh("../../src/config.mjs");

    assert.equal(await config.readActiveBotId(), "default");
    await config.writeActiveBotId("alpha");
    assert.equal(await config.readActiveBotId(), "alpha");
  });
});
