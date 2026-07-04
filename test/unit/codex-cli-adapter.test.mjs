import test from "node:test";
import assert from "node:assert/strict";

import { importFresh, withTempHome } from "../helpers/module.js";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

test("codex cli adapter forwards AgentEvents and child process handle", async () => {
  await withTempHome(async () => {
    const { createCodexCliAdapter } = await importFresh("../../src/agents/codex-cli-adapter.mjs");
    const events = [];
    let child = null;
    const script = [
      "process.stdin.resume();",
      "console.log(JSON.stringify({ type: 'thread.started', thread_id: 'thread_adapter' }));",
      "console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'adapter done' } }));",
    ].join("");
    const adapter = createCodexCliAdapter({
      cwd: process.cwd(),
      startCommand: `${shellQuote(process.execPath)} -e ${shellQuote(script)}`,
      resumeTemplate: `${shellQuote(process.execPath)} -e ${shellQuote(script)}`,
    });

    const result = await adapter.runTurn({
      prompt: "hello",
      runId: "run_adapter",
      sessionKey: "telegram:user:1",
      onChild: (value) => {
        child = value;
      },
    }, {
      onEvent: (event) => events.push(event),
    });

    assert.equal(result.ok, true);
    assert.equal(result.cliSessionRef, "thread_adapter");
    assert.equal(result.output, "adapter done");
    assert.equal(child?.pid > 0, true);
    assert.deepEqual(events.map((event) => event.type), ["session.started", "message.completed"]);
    assert.equal(events[0].runId, "run_adapter");
    assert.equal(events[0].sessionKey, "telegram:user:1");
  });
});
