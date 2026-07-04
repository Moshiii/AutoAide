import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

function envelope(extra = {}) {
  return {
    channel: "feishu",
    messageId: "m_1",
    chatType: "direct",
    chatId: "oc_1",
    userId: "ou_1",
    isDirect: true,
    text: "hello",
    ...extra,
  };
}

test("channel runtime dedupes repeated message ids", async () => {
  const { createChannelRuntime } = await importFresh("../../src/channels/channel-runtime.mjs");
  let runs = 0;
  const runtime = createChannelRuntime({
    channel: "feishu",
    runMessage: async () => {
      runs += 1;
      return { ok: true, output: "done" };
    },
  });

  assert.equal((await runtime.handleEnvelope(envelope())).status, "run");
  assert.equal((await runtime.handleEnvelope(envelope())).status, "duplicate");
  assert.equal(runs, 1);
});

test("channel runtime routes slash commands before runner", async () => {
  const { createChannelRuntime } = await importFresh("../../src/channels/channel-runtime.mjs");
  const sent = [];
  let runs = 0;
  const runtime = createChannelRuntime({
    channel: "feishu",
    sendReply: async (_envelope, text) => sent.push(text),
    commandHandlers: {
      help: async ({ envelope: nextEnvelope }) => {
        sent.push(`help:${nextEnvelope.chatId}`);
        return { ok: true };
      },
    },
    runMessage: async () => {
      runs += 1;
      return { ok: true, output: "done" };
    },
  });

  const result = await runtime.handleEnvelope(envelope({ text: "/help" }));

  assert.equal(result.status, "command");
  assert.equal(result.command.action, "help");
  assert.deepEqual(sent, ["help:oc_1"]);
  assert.equal(runs, 0);
});

test("channel runtime sends unsupported command fallback", async () => {
  const { createChannelRuntime } = await importFresh("../../src/channels/channel-runtime.mjs");
  const sent = [];
  const runtime = createChannelRuntime({
    channel: "telegram",
    sendReply: async (_envelope, text) => sent.push(text),
  });

  const result = await runtime.handleEnvelope(envelope({ channel: "telegram", text: "/wat" }));

  assert.equal(result.status, "command");
  assert.deepEqual(sent, ["Unsupported command: /wat\nTry /help."]);
});

test("channel runtime runs normal messages and stores thread refs", async () => {
  const { createChannelRuntime } = await importFresh("../../src/channels/channel-runtime.mjs");
  const sent = [];
  const events = [];
  const runtime = createChannelRuntime({
    channel: "telegram",
    sendReply: async (_envelope, text) => sent.push(text),
    onEvent: (event) => events.push(event.type),
    runMessage: async ({ scope, session }) => ({
      ok: true,
      output: `${scope.channel}:${session.sessionLabel}`,
      cliSessionRef: "codex-thread-1",
      threadRef: "thread-ref-1",
    }),
  });

  const result = await runtime.handleEnvelope(envelope({ channel: "telegram", messageId: "m_2" }));

  assert.equal(result.status, "run");
  assert.deepEqual(sent, [`telegram:${result.session.sessionLabel}`]);
  assert.equal(result.session.cliSessionRef, "codex-thread-1");
  assert.equal(result.session.threadRef, "thread-ref-1");
  assert.deepEqual(events, ["channel.received", "channel.run_completed"]);
});

test("channel runtime reports no runner with text fallback", async () => {
  const { createChannelRuntime } = await importFresh("../../src/channels/channel-runtime.mjs");
  const sent = [];
  const runtime = createChannelRuntime({
    channel: "feishu",
    sendReply: async (_envelope, text) => sent.push(text),
  });

  const result = await runtime.handleEnvelope(envelope());

  assert.equal(result.status, "no_runner");
  assert.equal(result.reply, "No channel runner configured.");
  assert.deepEqual(sent, ["No channel runner configured."]);
});

test("channel runtime requires a channel", async () => {
  const { createChannelRuntime } = await importFresh("../../src/channels/channel-runtime.mjs");

  assert.throws(() => createChannelRuntime(), /requires a channel/);
});
