import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("agent request normalization accepts legacy input and session refs", async () => {
  const { normalizeAgentRequest } = await importFresh("../../src/agents/types.mjs");

  const metadata = { source: "telegram" };
  const request = normalizeAgentRequest({
    input: "hello",
    cliSessionRef: "thread_1",
    runId: " run_1 ",
    sessionKey: " channel:user ",
    agentProvider: " codex-sdk ",
    metadata,
  });

  assert.equal(request.prompt, "hello");
  assert.equal(request.sessionRef, "thread_1");
  assert.equal(request.runId, "run_1");
  assert.equal(request.sessionKey, "channel:user");
  assert.equal(request.provider, "codex-sdk");
  assert.deepEqual(request.metadata, metadata);
  assert.notEqual(request.metadata, metadata);
});

test("agent request normalization preserves prompt over legacy input", async () => {
  const { normalizeAgentRequest } = await importFresh("../../src/agents/types.mjs");

  const request = normalizeAgentRequest({
    prompt: "new prompt",
    input: "old input",
    codexThreadId: "thread_codex",
  });

  assert.equal(request.prompt, "new prompt");
  assert.equal(request.sessionRef, "thread_codex");
  assert.equal(request.provider, "codex-cli");
});

test("agent result normalization accepts stdout stderr and thread aliases", async () => {
  const { normalizeAgentResult } = await importFresh("../../src/agents/types.mjs");

  const result = normalizeAgentResult({
    stdout: "done",
    stderr: "warning",
    threadRef: "thread_2",
    agentProvider: " custom-agent ",
  });

  assert.equal(result.ok, true);
  assert.equal(result.stopped, false);
  assert.equal(result.output, "done");
  assert.equal(result.error, "warning");
  assert.equal(result.cliSessionRef, "thread_2");
  assert.equal(result.codexThreadId, "thread_2");
  assert.equal(result.provider, "custom-agent");
});

test("agent result normalization keeps explicit failed and stopped flags", async () => {
  const { normalizeAgentResult } = await importFresh("../../src/agents/types.mjs");

  const result = normalizeAgentResult({
    ok: false,
    stopped: true,
    output: "partial",
    codexThreadId: "thread_3",
  });

  assert.equal(result.ok, false);
  assert.equal(result.stopped, true);
  assert.equal(result.output, "partial");
  assert.equal(result.cliSessionRef, "thread_3");
  assert.equal(result.provider, "codex-cli");
});

test("agent adapter assertion rejects malformed adapters", async () => {
  const { assertAgentAdapter } = await importFresh("../../src/agents/types.mjs");
  const adapter = { runTurn: async () => ({ ok: true }) };

  assert.equal(assertAgentAdapter(adapter, "mock"), adapter);
  assert.throws(() => assertAgentAdapter({}, "broken"), /must expose runTurn/);
});
