import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("channel command parser preserves Feishu slash command parsing contract", async () => {
  const { parseSlashCommand } = await importFresh("../../src/feishu/command-router.mjs");
  const { parseChannelCommand } = await importFresh("../../src/channels/command-router.mjs");

  for (const text of [" /help now", "hello /credits", "hello", ""]) {
    assert.equal(parseChannelCommand(text), parseSlashCommand(text));
  }
});

test("channel command classifier keeps known commands out of agent turns", async () => {
  const { classifyChannelCommand, shouldRouteToAgent } = await importFresh("../../src/channels/command-router.mjs");

  assert.deepEqual(classifyChannelCommand("/help"), {
    handled: true,
    command: "/help",
    action: "help",
    known: true,
  });
  assert.deepEqual(classifyChannelCommand("/schedule-stop"), {
    handled: true,
    command: "/schedule-stop",
    action: "schedule_stop",
    known: true,
  });
  assert.deepEqual(classifyChannelCommand("/wat"), {
    handled: true,
    command: "/wat",
    action: "unsupported",
    known: false,
  });
  assert.equal(shouldRouteToAgent("/help"), false);
  assert.equal(shouldRouteToAgent("normal prompt"), true);
});

test("channel command router invokes known and unsupported handlers", async () => {
  const { createChannelCommandRouter } = await importFresh("../../src/channels/command-router.mjs");
  const calls = [];
  const router = createChannelCommandRouter({
    help: async (context) => calls.push(["help", context.command]),
    unsupported: async (context) => calls.push(["unsupported", context.command]),
  });

  assert.equal((await router({ text: "/help" })).handled, true);
  assert.equal((await router({ text: "/unknown" })).handled, true);
  assert.equal((await router({ text: "run this" })).handled, false);
  assert.deepEqual(calls, [["help", "/help"], ["unsupported", "/unknown"]]);
});
