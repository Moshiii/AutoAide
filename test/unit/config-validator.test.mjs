import test from "node:test";
import assert from "node:assert/strict";

import { importFresh, withTempHome } from "../helpers/module.js";

test("validateBotConfig accepts normalized default config", async () => {
  await withTempHome(async () => {
    const { createDefaultBotConfig, normalizeBotConfig } = await importFresh("../../src/config.mjs");
    const { validateBotConfig } = await importFresh("../../src/config-validator.mjs");

    const errors = validateBotConfig(normalizeBotConfig(createDefaultBotConfig()));

    assert.deepEqual(errors, []);
  });
});

test("writeConfig rejects redacted secrets", async () => {
  await withTempHome(async () => {
    const { createDefaultBotConfig, writeConfig } = await importFresh("../../src/config.mjs");

    await assert.rejects(
      () => writeConfig({
        ...createDefaultBotConfig(),
        channels: {
          ...createDefaultBotConfig().channels,
          telegram: {
            ...createDefaultBotConfig().channels.telegram,
            botToken: "[redacted]",
          },
        },
      }),
      /Redacted Telegram token/,
    );
  });
});

test("validateBotConfig reports malformed channel arrays", async () => {
  await withTempHome(async () => {
    const { createDefaultBotConfig, normalizeBotConfig } = await importFresh("../../src/config.mjs");
    const { validateBotConfig } = await importFresh("../../src/config-validator.mjs");

    const config = normalizeBotConfig(createDefaultBotConfig());
    config.channels.telegram.groups.allowedUserIds = "not-array";
    config.channels.feishu.testAudience.userIds = "not-array";
    config.channels.feishu.documentHandling.defaultOutput = "pdf_only";
    config.channels.feishu.documentHandling.allowAttachmentInput = "yes";
    config.channels.feishu.callback.enabled = "yes";
    config.channels.feishu.callback.port = 70000;
    config.channels.feishu.callback.path = "webhook/card";
    config.channels.feishu.callback.signingSecret = "[redacted]";
    const errors = validateBotConfig(config);

    assert.equal(errors.some((error) => error.path === "channels.telegram.groups.allowedUserIds"), true);
    assert.equal(errors.some((error) => error.path === "channels.feishu.testAudience.userIds"), true);
    assert.equal(errors.some((error) => error.path === "channels.feishu.documentHandling.defaultOutput"), true);
    assert.equal(errors.some((error) => error.path === "channels.feishu.documentHandling.allowAttachmentInput"), true);
    assert.equal(errors.some((error) => error.path === "channels.feishu.callback.enabled"), true);
    assert.equal(errors.some((error) => error.path === "channels.feishu.callback.port"), true);
    assert.equal(errors.some((error) => error.path === "channels.feishu.callback.path"), true);
    assert.equal(errors.some((error) => error.path === "channels.feishu.callback.signingSecret"), true);
  });
});

test("validateBotConfig reports malformed storage provider", async () => {
  await withTempHome(async () => {
    const { createDefaultBotConfig, normalizeBotConfig } = await importFresh("../../src/config.mjs");
    const { validateBotConfig } = await importFresh("../../src/config-validator.mjs");

    const config = normalizeBotConfig(createDefaultBotConfig());
    config.storage.provider = "postgres";
    const errors = validateBotConfig(config);

    assert.equal(errors.some((error) => error.path === "storage.provider"), true);
  });
});

test("validateBotConfig reports malformed runtime process limits", async () => {
  await withTempHome(async () => {
    const { createDefaultBotConfig, normalizeBotConfig } = await importFresh("../../src/config.mjs");
    const { validateBotConfig } = await importFresh("../../src/config-validator.mjs");

    const config = normalizeBotConfig(createDefaultBotConfig());
    config.runtime.maxRunMs = 0;
    config.runtime.maxOutputBytes = "large";
    const errors = validateBotConfig(config);

    assert.equal(errors.some((error) => error.path === "runtime.maxRunMs"), true);
    assert.equal(errors.some((error) => error.path === "runtime.maxOutputBytes"), true);
  });
});

test("validateBotConfig reports malformed runtime isolation readiness", async () => {
  await withTempHome(async () => {
    const { createDefaultBotConfig, normalizeBotConfig } = await importFresh("../../src/config.mjs");
    const { validateBotConfig } = await importFresh("../../src/config-validator.mjs");

    const config = normalizeBotConfig(createDefaultBotConfig());
    config.runtime.isolation.mode = "ssh";
    config.runtime.isolation.verified = "yes";
    config.runtime.isolation.notes = 123;
    config.runtime.isolation.lastProbe = {
      status: "unknown",
      checkedAt: 123,
      summary: 456,
    };
    const errors = validateBotConfig(config);

    assert.equal(errors.some((error) => error.path === "runtime.isolation.mode"), true);
    assert.equal(errors.some((error) => error.path === "runtime.isolation.verified"), true);
    assert.equal(errors.some((error) => error.path === "runtime.isolation.notes"), true);
    assert.equal(errors.some((error) => error.path === "runtime.isolation.lastProbe.status"), true);
    assert.equal(errors.some((error) => error.path === "runtime.isolation.lastProbe.checkedAt"), true);
    assert.equal(errors.some((error) => error.path === "runtime.isolation.lastProbe.summary"), true);
  });
});
