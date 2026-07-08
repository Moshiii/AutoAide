import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "");
}

function createOutput() {
  let output = "";
  return {
    isTTY: false,
    columns: 80,
    write(chunk) {
      output += String(chunk);
      return true;
    },
    read() {
      return output;
    },
  };
}

test("renderRunPanel renders a compact live status panel", async () => {
  const { renderRunPanel } = await importFresh("../../src/cli-renderer.mjs");

  const rendered = stripAnsi(renderRunPanel({
    sessionLabel: "main",
    status: "Running /bin/zsh -lc sed...",
    elapsed: "00:07",
    width: 52,
  }));

  assert.match(rendered, /main/);
  assert.match(rendered, /Running \/bin\/zsh/);
  assert.match(rendered, /elapsed 00:07/);
  assert.doesNotMatch(rendered, /。。/);
  assert.doesNotMatch(rendered, /press \/stop to interrupt/);
});

test("non-interactive cli renderer keeps plain persistent output", async () => {
  const { createCliRenderer } = await importFresh("../../src/cli-renderer.mjs");
  const output = createOutput();
  let now = 0;
  const renderer = createCliRenderer({
    input: { isTTY: false },
    output,
    forceInteractive: false,
    now: () => now,
  });

  renderer.startRun("main");
  renderer.updateRunStatus("Session started");
  now = 2500;
  renderer.finishRun({ ok: true, sessionLabel: "main" });

  const plain = stripAnsi(output.read());
  assert.match(plain, /Running on \[main\]\.\.\./);
  assert.match(plain, /\[status\] Session started/);
  assert.match(plain, /main completed in 00:02/);
});

test("sessionBusy renders a single-line warning", async () => {
  const { createCliRenderer } = await importFresh("../../src/cli-renderer.mjs");
  const output = createOutput();
  const renderer = createCliRenderer({
    input: { isTTY: false },
    output,
    forceInteractive: false,
  });

  renderer.sessionBusy("main");

  const plain = stripAnsi(output.read());
  assert.match(plain, /main is already running/);
  assert.match(plain, /use \/stop first/);
  assert.doesNotMatch(plain, /Session Busy/);
});
