import test from "node:test";
import assert from "node:assert/strict";

import { importFresh, withTempHome } from "../helpers/module.js";

test("Feishu prepared runner keeps legacy path behavior by default", async () => {
  await withTempHome(async () => {
    const { runPreparedFeishuCodexTurn } = await importFresh("../../src/feishu/prepared-runner.mjs");
    const calls = [];
    const activeRuns = new Map();

    const result = await runPreparedFeishuCodexTurn({
      runRecord: {
        runId: "run_legacy",
        userId: "feishu:ou_1",
      },
      chargeResult: {
        costSource: "daily_free",
        charged: 1,
      },
      promptText: "hello",
      botHome: "/tmp/bot",
      chatState: {
        cliSessionRef: null,
      },
      routeKey: "feishu:chat:1:user:1",
      commandConfig: {},
      activeRuns,
      onRunning: () => calls.push(["onRunning"]),
      deps: {
        buildWorkspacePrompt: async (text) => `workspace:${text}`,
        markRunRunning: async (runId, patch) => calls.push(["running", runId, patch]),
        markRunCompleted: async (runId, patch) => calls.push(["completed", runId, patch]),
        startCliTurn: (prompt) => {
          calls.push(["start", prompt]);
          return {
            child: { pid: 123 },
            result: Promise.resolve({
              ok: true,
              output: "done",
              cliSessionRef: "thread_1",
            }),
          };
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.outputText, "done");
    assert.equal(result.cliSessionRef, "thread_1");
    assert.equal(activeRuns.size, 0);
    assert.deepEqual(calls.map((call) => call[0]), ["running", "onRunning", "start", "completed"]);
  });
});

test("Feishu prepared runner can use RunExecutor without creating a second run", async () => {
  await withTempHome(async () => {
    const { runPreparedFeishuCodexTurn } = await importFresh("../../src/feishu/prepared-runner.mjs");
    const calls = [];
    const logEvent = () => {};

    const result = await runPreparedFeishuCodexTurn({
      useRunExecutor: true,
      runRecord: {
        runId: "run_prepared",
        userId: "feishu:ou_1",
      },
      chargeResult: {
        costSource: "paid_credit",
        charged: 1,
      },
      promptText: "hello",
      botHome: "/tmp/bot",
      chatState: {
        cliSessionRef: "thread_old",
      },
      routeKey: "feishu:chat:1:user:1",
      commandConfig: {},
      activeRuns: new Map(),
      onRunning: () => calls.push(["onRunning"]),
      permissionBroker: { name: "permission" },
      questionBroker: { name: "question" },
      logEvent,
      deps: {
        buildWorkspacePrompt: async (text) => `workspace:${text}`,
        createCodexCliAdapter: () => ({
          async runTurn(request) {
            calls.push(["adapter", request.prompt, request.sessionRef, request.runId]);
            return {
              ok: true,
              output: "executor done",
              cliSessionRef: "thread_new",
            };
          },
        }),
        executeRun: async (request, deps) => {
          calls.push(["execute", request.run.runId]);
          assert.deepEqual(request.permissionBroker, { name: "permission" });
          assert.deepEqual(request.questionBroker, { name: "question" });
          assert.equal(request.logEvent, logEvent);
          await request.onRunning?.(request.run);
          const result = await deps.agentAdapter.runTurn({
            ...request.agentRequest,
            runId: request.run.runId,
          }, {});
          return {
            result,
            run: {
              ...request.run,
              status: "completed",
            },
            events: [],
          };
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.outputText, "executor done");
    assert.equal(result.cliSessionRef, "thread_new");
    assert.deepEqual(calls, [
      ["execute", "run_prepared"],
      ["onRunning"],
      ["adapter", "workspace:hello", "thread_old", "run_prepared"],
    ]);
  });
});

test("Feishu prepared runner keeps failed response path even when billing settlement fails", async () => {
  await withTempHome(async () => {
    const { runPreparedFeishuCodexTurn } = await importFresh("../../src/feishu/prepared-runner.mjs");

    const result = await runPreparedFeishuCodexTurn({
      runRecord: {
        runId: "run_failed",
        userId: "feishu:ou_1",
      },
      chargeResult: {
        costSource: "paid_credit",
        charged: 1,
      },
      promptText: "hello",
      botHome: "/tmp/bot",
      chatState: {},
      routeKey: "feishu:chat:1:user:1",
      commandConfig: {},
      activeRuns: new Map(),
      deps: {
        buildWorkspacePrompt: async (text) => text,
        markRunRunning: async () => {},
        markRunFailed: async () => {},
        settleFailedRunBilling: async () => {
          throw new Error("refund unavailable");
        },
        startCliTurn: () => ({
          child: { pid: 123 },
          result: Promise.resolve({
            ok: false,
            stderr: "codex failed",
          }),
        }),
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorText, "codex failed");
  });
});
