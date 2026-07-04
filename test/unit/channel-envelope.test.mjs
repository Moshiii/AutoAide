import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("channels envelope module preserves legacy Telegram envelope contract", async () => {
  const legacy = await importFresh("../../src/channel-envelope.mjs");
  const channels = await importFresh("../../src/channels/envelope.mjs");
  const message = {
    message_id: 42,
    chat: {
      id: 1001,
      type: "private",
    },
    from: {
      id: 2002,
    },
  };
  const options = {
    text: "hello",
  };

  assert.deepEqual(
    channels.normalizeTelegramEnvelope(message, options),
    legacy.normalizeTelegramEnvelope(message, options),
  );
});

test("channels envelope module preserves legacy Feishu envelope contract", async () => {
  const legacy = await importFresh("../../src/channel-envelope.mjs");
  const channels = await importFresh("../../src/channels/envelope.mjs");
  const event = {
    sender: {
      sender_id: {
        open_id: "ou_1",
      },
    },
    message: {
      message_id: "om_1",
      chat_id: "oc_1",
      chat_type: "group",
    },
  };
  const options = {
    text: "hello",
    explicitlyMentionedBot: true,
  };

  assert.deepEqual(
    channels.normalizeFeishuEnvelope(event, options),
    legacy.normalizeFeishuEnvelope(event, options),
  );
});
