import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

const VALID_TELEGRAM_TOKEN = "123456789:AAabcdef1234567890abcdef1234567890";

function baseConfig() {
  return {
    channels: {
      telegram: {
        botToken: VALID_TELEGRAM_TOKEN,
        botUsername: "demo_bot",
        groups: {
          requireExplicitMention: true,
        },
      },
      feishu: {
        appId: "cli_a",
        appSecret: "secret-a",
        verificationToken: "verify-a",
        encryptKey: "encrypt-a",
        callback: {
          signingSecret: "callback-secret-a",
        },
      },
    },
  };
}

test("control plane config service redacts channel secrets", async () => {
  const { redactConfigSecrets } = await importFresh("../../src/control-plane-config-service.mjs");
  const redacted = redactConfigSecrets(baseConfig());

  assert.equal(redacted.channels.telegram.botToken, "[redacted]");
  assert.equal(redacted.channels.feishu.appSecret, "[redacted]");
  assert.equal(redacted.channels.feishu.verificationToken, "[redacted]");
  assert.equal(redacted.channels.feishu.encryptKey, "[redacted]");
  assert.equal(redacted.channels.feishu.callback.signingSecret, "[redacted]");
  assert.equal(redacted.channels.telegram.botUsername, "demo_bot");
});

test("control plane config service preserves existing secrets when patch contains redacted values", async () => {
  const { applySafeConfigPatch } = await importFresh("../../src/control-plane-config-service.mjs");
  const next = applySafeConfigPatch(baseConfig(), {
    channels: {
      telegram: {
        botToken: "[redacted]",
        groups: {
          requireExplicitMention: false,
        },
      },
      feishu: {
        appSecret: "[redacted]",
        verificationToken: "[redacted]",
        encryptKey: "[redacted]",
        callback: {
          signingSecret: "[redacted]",
        },
      },
    },
  });

  assert.equal(next.channels.telegram.botToken, VALID_TELEGRAM_TOKEN);
  assert.equal(next.channels.telegram.groups.requireExplicitMention, false);
  assert.equal(next.channels.feishu.appSecret, "secret-a");
  assert.equal(next.channels.feishu.verificationToken, "verify-a");
  assert.equal(next.channels.feishu.encryptKey, "encrypt-a");
  assert.equal(next.channels.feishu.callback.signingSecret, "callback-secret-a");
});

test("control plane config service rejects placeholder Telegram tokens", async () => {
  const { applySafeConfigPatch } = await importFresh("../../src/control-plane-config-service.mjs");

  assert.throws(
    () => applySafeConfigPatch(baseConfig(), { channels: { telegram: { botToken: "placeholder" } } }),
    /placeholder Telegram token/,
  );
  assert.throws(
    () => applySafeConfigPatch(baseConfig(), { channels: { telegram: { botToken: "BOT_TOKEN" } } }),
    /placeholder Telegram token/,
  );
  assert.throws(
    () => applySafeConfigPatch(baseConfig(), { channels: { telegram: { botToken: "not-a-botfather-token" } } }),
    /BotFather format/,
  );
});
