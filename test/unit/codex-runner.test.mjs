import test from "node:test";
import assert from "node:assert/strict";

import { importFresh, withTempHome } from "../helpers/module.js";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

test("getShellSpec defaults to non-login shell on unix", async () => {
  await withTempHome(async () => {
    delete process.env.CODEXBRIDGE_LOGIN_SHELL;
    const { getShellSpec } = await importFresh("../../src/codex-runner.mjs");

    if (process.platform === "win32") {
      assert.deepEqual(getShellSpec().args, ["/d", "/s", "/c"]);
      return;
    }

    assert.deepEqual(getShellSpec().args, ["-c"]);
  });
});

test("getShellSpec supports explicit login-shell opt-in", async () => {
  await withTempHome(async () => {
    process.env.CODEXBRIDGE_LOGIN_SHELL = "true";
    const { getShellSpec } = await importFresh("../../src/codex-runner.mjs");

    if (process.platform === "win32") {
      assert.deepEqual(getShellSpec().args, ["/d", "/s", "/c"]);
      return;
    }

    assert.deepEqual(getShellSpec().args, ["-lc"]);
    delete process.env.CODEXBRIDGE_LOGIN_SHELL;
  });
});

test("buildCommandConfig injects model into default exec commands", async () => {
  await withTempHome(async () => {
    const { buildCommandConfig } = await importFresh("../../src/codex-runner.mjs");
    const config = buildCommandConfig({
      runtime: {
        model: "gpt-5.4-mini",
      },
    });

    assert.match(config.startCommand, /--model 'gpt-5\.4-mini'/);
    assert.match(config.resumeTemplate, /--model 'gpt-5\.4-mini'/);
    assert.equal(config.maxRunMs, 30 * 60 * 1000);
    assert.equal(config.maxOutputBytes, 2 * 1024 * 1024);
  });
});

test("buildCommandConfig supports runtime process limits", async () => {
  await withTempHome(async () => {
    const { buildCommandConfig } = await importFresh("../../src/codex-runner.mjs");
    const config = buildCommandConfig({
      runtime: {
        model: "gpt-5.4-mini",
        maxRunMs: 1234,
        maxOutputBytes: 5678,
      },
    });

    assert.equal(config.maxRunMs, 1234);
    assert.equal(config.maxOutputBytes, 5678);
  });
});

test("buildCommandConfig does not duplicate explicit model flags", async () => {
  await withTempHome(async () => {
    process.env.CODEX_START_COMMAND = "codex exec --model gpt-5.4 --json -";
    process.env.CODEX_RESUME_COMMAND_TEMPLATE = "codex exec resume --model gpt-5.4 __SESSION_ID__ -";
    const { buildCommandConfig } = await importFresh("../../src/codex-runner.mjs");
    const config = buildCommandConfig({
      runtime: {
        model: "gpt-5.4-mini",
      },
    });

    assert.equal((config.startCommand.match(/--model/g) || []).length, 1);
    assert.equal((config.resumeTemplate.match(/--model/g) || []).length, 1);
    delete process.env.CODEX_START_COMMAND;
    delete process.env.CODEX_RESUME_COMMAND_TEMPLATE;
  });
});

test("applyRunPolicyToCommandConfig restricts cwd and environment", async () => {
  await withTempHome(async (tempHome) => {
    const { buildCommandConfig, applyRunPolicyToCommandConfig } = await importFresh("../../src/codex-runner.mjs");
    const { createWorkspacePolicy } = await importFresh("../../src/policy/workspace-policy.mjs");
    const { createRunPolicy } = await importFresh("../../src/policy/run-policy.mjs");
    const commandConfig = buildCommandConfig({ runtime: { model: "gpt-5.4-mini" } });
    const workspacePolicy = createWorkspacePolicy({ workspaceRoot: tempHome });
    const runPolicy = createRunPolicy({ envAllowlist: ["PATH", "OPENAI_API_KEY"] });

    const secured = applyRunPolicyToCommandConfig(commandConfig, {
      workspacePolicy,
      runPolicy,
      cwd: ".",
      env: {
        PATH: "/bin",
        OPENAI_API_KEY: "sk-test",
        SECRET_TOKEN: "hidden",
      },
    });

    assert.equal(secured.cwd, tempHome);
    assert.deepEqual(secured.env, {
      PATH: "/bin",
      OPENAI_API_KEY: "sk-test",
    });
    assert.throws(
      () => applyRunPolicyToCommandConfig(commandConfig, {
        workspacePolicy,
        cwd: "..",
      }),
      /outside_workspace/,
    );
  });
});

test("startCliTurn uses commandConfig env when provided", async () => {
  await withTempHome(async () => {
    const { startCliTurn } = await importFresh("../../src/codex-runner.mjs");
    const script = [
      "process.stdin.resume();",
      "console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: process.env.VISIBLE_VALUE || 'missing' } }));",
    ].join("");
    const started = startCliTurn("hello", null, {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH || "",
        VISIBLE_VALUE: "from-policy",
      },
      startCommand: `${shellQuote(process.execPath)} -e ${shellQuote(script)}`,
      resumeTemplate: `${shellQuote(process.execPath)} -e ${shellQuote(script)}`,
    });

    const result = await started.result;

    assert.equal(result.ok, true);
    assert.equal(result.output, "from-policy");
  });
});

test("startCliTurn emits AgentEvent without changing status and final output behavior", async () => {
  await withTempHome(async () => {
    const { startCliTurn } = await importFresh("../../src/codex-runner.mjs");
    const statuses = [];
    const agentEvents = [];
    const script = [
      "process.stdin.resume();",
      "console.log(JSON.stringify({ type: 'thread.started', thread_id: 'thread_from_fake_cli' }));",
      "console.log(JSON.stringify({ type: 'item.started', item: { id: 'tool_1', type: 'tool_call', name: 'read_file' } }));",
      "console.log(JSON.stringify({ type: 'item.completed', item: { id: 'msg_1', type: 'agent_message', text: 'fake final' } }));",
    ].join("");
    const started = startCliTurn("hello", null, {
      cwd: process.cwd(),
      startCommand: `${shellQuote(process.execPath)} -e ${shellQuote(script)}`,
      resumeTemplate: `${shellQuote(process.execPath)} -e ${shellQuote(script)}`,
      onStatus: (summary) => statuses.push(summary),
      onAgentEvent: (event) => agentEvents.push(event),
      agentEventContext: {
        runId: "run_fake",
        sessionKey: "telegram:user:123",
        createdAt: "2026-06-25T00:00:00.000Z",
      },
    });

    const result = await started.result;

    assert.equal(result.ok, true);
    assert.equal(result.cliSessionRef, "thread_from_fake_cli");
    assert.equal(result.output, "fake final");
    assert.deepEqual(statuses, [
      "Session started",
      "Using read_file...",
    ]);
    assert.deepEqual(agentEvents.map((event) => event.type), [
      "session.started",
      "tool.started",
      "message.completed",
    ]);
    assert.equal(agentEvents[0].runId, "run_fake");
    assert.equal(agentEvents[0].sessionKey, "telegram:user:123");
  });
});

test("startCliTurn stops runs after maxRunMs", async () => {
  await withTempHome(async () => {
    const { startCliTurn } = await importFresh("../../src/codex-runner.mjs");
    const script = [
      "process.stdin.resume();",
      "setTimeout(() => console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'late' } })), 1000);",
    ].join("");
    const started = startCliTurn("hello", null, {
      cwd: process.cwd(),
      startCommand: `${shellQuote(process.execPath)} -e ${shellQuote(script)}`,
      resumeTemplate: `${shellQuote(process.execPath)} -e ${shellQuote(script)}`,
      maxRunMs: 50,
      hardKillMs: 50,
    });

    const result = await started.result;

    assert.equal(result.ok, false);
    assert.equal(result.timedOut, true);
    assert.match(result.stderr, /timed out/);
  });
});

test("startCliTurn stops runs after maxOutputBytes", async () => {
  await withTempHome(async () => {
    const { startCliTurn } = await importFresh("../../src/codex-runner.mjs");
    const script = [
      "process.stdin.resume();",
      "console.log('x'.repeat(10000));",
      "setTimeout(() => {}, 1000);",
    ].join("");
    const started = startCliTurn("hello", null, {
      cwd: process.cwd(),
      startCommand: `${shellQuote(process.execPath)} -e ${shellQuote(script)}`,
      resumeTemplate: `${shellQuote(process.execPath)} -e ${shellQuote(script)}`,
      maxRunMs: 5000,
      maxOutputBytes: 128,
      hardKillMs: 50,
    });

    const result = await started.result;

    assert.equal(result.ok, false);
    assert.equal(result.outputLimitExceeded, true);
    assert.match(result.stderr, /maxOutputBytes/);
  });
});
