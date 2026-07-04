import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("agent adapter registry defaults to codex-cli and lists providers", async () => {
  const { createAgentAdapterRegistry, DEFAULT_AGENT_PROVIDER } = await importFresh("../../src/agents/adapter-registry.mjs");
  const registry = createAgentAdapterRegistry({
    createCodexCliAdapter: () => ({ runTurn: async () => ({ ok: true, output: "cli" }) }),
    createCodexSdkAdapter: () => ({ runTurn: async () => ({ ok: true, output: "sdk" }) }),
  });

  assert.equal(DEFAULT_AGENT_PROVIDER, "codex-cli");
  assert.deepEqual(registry.list(), ["codex-cli", "codex-sdk"]);
  assert.equal(registry.has("codex-cli"), true);
  assert.deepEqual(await registry.create("codex-cli").runTurn(), { ok: true, output: "cli" });
});

test("agent adapter registry creates env-selected providers", async () => {
  const { createAgentAdapterForEnv, createAgentAdapterRegistry, resolveAgentProvider } = await importFresh("../../src/agents/adapter-registry.mjs");
  const registry = createAgentAdapterRegistry({
    createCodexCliAdapter: () => ({ runTurn: async () => ({ ok: true, output: "cli" }) }),
    createCodexSdkAdapter: () => ({ runTurn: async () => ({ ok: true, output: "sdk" }) }),
  });

  assert.equal(resolveAgentProvider({}), "codex-cli");
  assert.equal(resolveAgentProvider({ CODEXBRIDGE_AGENT_PROVIDER: "CODEX-SDK" }), "codex-sdk");
  assert.deepEqual(await createAgentAdapterForEnv({ CODEXBRIDGE_AGENT_PROVIDER: "codex-sdk" }, {}, { registry }).runTurn(), {
    ok: true,
    output: "sdk",
  });
});

test("agent adapter registry supports custom providers", async () => {
  const { createAgentAdapterRegistry } = await importFresh("../../src/agents/adapter-registry.mjs");
  const registry = createAgentAdapterRegistry({
    createCodexCliAdapter: () => ({ runTurn: async () => ({ ok: true }) }),
    adapters: {
      "mock-agent": () => ({ runTurn: async () => ({ ok: true, output: "mock" }) }),
    },
  });

  assert.equal(registry.has("mock-agent"), true);
  assert.deepEqual(await registry.create("mock-agent").runTurn(), { ok: true, output: "mock" });
});

test("agent adapter registry rejects unknown or malformed providers", async () => {
  const { createAgentAdapterRegistry } = await importFresh("../../src/agents/adapter-registry.mjs");
  const registry = createAgentAdapterRegistry({
    createCodexCliAdapter: () => ({ runTurn: async () => ({ ok: true }) }),
  });

  assert.throws(() => registry.create("missing"), /Unknown agent provider 'missing'/);
  assert.throws(() => registry.register("bad", null), /requires a factory/);
  registry.register("broken", () => ({}));
  assert.throws(() => registry.create("broken"), /must expose runTurn/);
});

test("codex sdk adapter is explicit experimental injection point", async () => {
  const { createCodexSdkAdapter } = await importFresh("../../src/agents/codex-sdk-adapter.mjs");
  const events = [];

  await assert.rejects(() => createCodexSdkAdapter().runTurn({ runId: "run_1" }), /requires an injected runTurn/);

  const adapter = createCodexSdkAdapter({
    runTurn: async () => ({ ok: true, output: "sdk done", cliSessionRef: "sdk_thread" }),
  });
  const result = await adapter.runTurn({
    runId: "run_1",
    sessionKey: "feishu:user:1",
  }, {
    onEvent: (event) => events.push(event),
  });

  assert.equal(result.ok, true);
  assert.equal(result.output, "sdk done");
  assert.equal(result.cliSessionRef, "sdk_thread");
  assert.equal(result.codexThreadId, "sdk_thread");
  assert.equal(result.provider, "codex-sdk");
  assert.equal(result.stopped, false);
  assert.equal(events[0].type, "run.started");
  assert.equal(events[0].provider, "codex-sdk");
  assert.equal(events[0].runId, "run_1");
  assert.equal(events[0].sessionKey, "feishu:user:1");
});
