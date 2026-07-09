import test from "node:test";
import assert from "node:assert/strict";

import { importFresh, withTempHome } from "../helpers/module.js";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function withEnv(patch, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of previous) {
        if (value == null) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test("runTuiTurn persists and resumes the main Codex session", async () => {
  await withTempHome(async () => {
    const { ensureDefaultBot } = await importFresh("../../src/bots.mjs");
    const { readCliState } = await importFresh("../../src/config.mjs");
    const { runTuiTurn } = await importFresh("../../src/tui-turn-service.mjs");
    await ensureDefaultBot();

    const startScript = [
      "console.log(JSON.stringify({ type: 'thread.started', thread_id: 'thread_tui_123' }));",
      "console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'first reply' } }));",
    ].join("");
    const resumeScript = [
      "const thread = process.argv[1];",
      "console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: `resumed ${thread}` } }));",
    ].join("");

    await withEnv({
      CODEX_START_COMMAND: `${shellQuote(process.execPath)} -e ${shellQuote(startScript)} -- --model fake`,
      CODEX_RESUME_COMMAND_TEMPLATE: `${shellQuote(process.execPath)} -e ${shellQuote(resumeScript)} __SESSION_ID__ -- --model fake`,
    }, async () => {
      const first = await runTuiTurn("default", "hello");
      const firstState = await readCliState();
      const second = await runTuiTurn("default", "continue");
      const secondState = await readCliState();

      assert.equal(first.ok, true);
      assert.equal(first.output, "first reply");
      assert.equal(first.resumed, false);
      assert.equal(first.cliSessionRef, "thread_tui_123");
      assert.equal(firstState.sessions.main.cliSessionRef, "thread_tui_123");

      assert.equal(second.ok, true);
      assert.equal(second.output, "resumed thread_tui_123");
      assert.equal(second.resumed, true);
      assert.equal(second.cliSessionRef, "thread_tui_123");
      assert.equal(secondState.sessions.main.cliSessionRef, "thread_tui_123");
    });
  });
});
