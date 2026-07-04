import test from "node:test";
import assert from "node:assert/strict";

import { importFresh, withTempHome } from "../helpers/module.js";

test("Telegram prepared runner keeps legacy path behavior by default", async () => {
  await withTempHome(async () => {
    const { runPreparedTelegramCodexTurn } = await importFresh("../../src/telegram/prepared-runner.mjs");
    const calls = [];
    const runningJobs = new Map();
    const result = await runPreparedTelegramCodexTurn({
      runRecord: {
        runId: "run_1",
        userId: "telegram:1",
      },
      chargeResult: {
        costSource: "daily_free",
        charged: 1,
      },
      promptText: "hello",
      botHome: "/tmp/bot",
      session: {
        cliSessionRef: null,
      },
      routeKey: "chat_1:main",
      chatId: "chat_1",
      messageId: "message_1",
      activeLabel: "main",
      envelope: {
        channel: "telegram",
        chatType: "group",
      },
      commandConfig: {},
      runningJobs,
      deps: {
        buildWorkspacePrompt: async (prompt, options) => {
          calls.push(["prompt", prompt, options.botHome]);
          return `workspace:${prompt}`;
        },
        startCliTurn: (prompt, sessionRef) => {
          calls.push(["start", prompt, sessionRef]);
          return {
            child: { pid: 123 },
            result: Promise.resolve({
              ok: true,
              output: "done",
              cliSessionRef: "thread_1",
            }),
          };
        },
        markRunRunning: async (...args) => calls.push(["running", ...args]),
        markRunCompleted: async (...args) => calls.push(["completed", ...args]),
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.messageText, "done");
    assert.equal(result.cliSessionRef, "thread_1");
    assert.equal(runningJobs.size, 0);
    assert.deepEqual(calls, [
      ["running", "run_1", { costSource: "daily_free", creditsCharged: 1 }, "/tmp/bot"],
      ["prompt", "hello", "/tmp/bot"],
      ["start", "workspace:hello", null],
      ["completed", "run_1", { codexThreadId: "thread_1", output: "done" }, "/tmp/bot"],
    ]);
  });
});

test("Telegram prepared runner can use RunExecutor without creating a second run", async () => {
  await withTempHome(async () => {
    const { runPreparedTelegramCodexTurn } = await importFresh("../../src/telegram/prepared-runner.mjs");
    const calls = [];
    const runningJobs = new Map();
    const logEvent = () => {};
    const result = await runPreparedTelegramCodexTurn({
      useRunExecutor: true,
      runRecord: {
        runId: "run_1",
        userId: "telegram:1",
      },
      chargeResult: {
        costSource: "paid_credit",
        charged: 1,
      },
      promptText: "hello",
      botHome: "/tmp/bot",
      session: {
        cliSessionRef: "thread_old",
      },
      routeKey: "chat_1:main",
      chatId: "chat_1",
      messageId: "message_1",
      activeLabel: "main",
      envelope: {
        channel: "telegram",
        chatType: "direct",
      },
      commandConfig: {},
      runningJobs,
      logEvent,
      deps: {
        buildWorkspacePrompt: async (prompt, options) => {
          calls.push(["prompt", prompt, options.botHome]);
          return `workspace:${prompt}`;
        },
        createCodexCliAdapter: () => ({
          async runTurn(request) {
            calls.push(["agent", request.prompt, request.sessionRef, request.sessionKey]);
            request.onChild?.({ pid: 456 });
            return {
              ok: true,
              output: "executor done",
              cliSessionRef: "thread_new",
            };
          },
        }),
        executeRun: async (request, deps) => {
          calls.push(["execute", request.run.runId, request.billing.channel, request.billing.chatType]);
          assert.equal(request.logEvent, logEvent);
          const result = await deps.agentAdapter.runTurn(request.agentRequest);
          return {
            run: {
              runId: request.run.runId,
              status: "completed",
            },
            result,
            events: [],
          };
        },
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.messageText, "executor done");
    assert.equal(result.cliSessionRef, "thread_new");
    assert.equal(runningJobs.size, 0);
    assert.deepEqual(calls, [
      ["prompt", "hello", "/tmp/bot"],
      ["execute", "run_1", "telegram", "direct"],
      ["agent", "workspace:hello", "thread_old", "chat_1:main"],
    ]);
  });
});

test("Telegram prepared runner keeps failed response path even when billing settlement fails", async () => {
  await withTempHome(async () => {
    const { runPreparedTelegramCodexTurn } = await importFresh("../../src/telegram/prepared-runner.mjs");
    const calls = [];
    const result = await runPreparedTelegramCodexTurn({
      runRecord: {
        runId: "run_1",
        userId: "telegram:1",
      },
      chargeResult: {
        paidCreditsCharged: 1,
      },
      promptText: "hello",
      botHome: "/tmp/bot",
      session: {},
      routeKey: "chat_1:main",
      chatId: "chat_1",
      messageId: "message_1",
      envelope: {
        channel: "telegram",
        chatType: "direct",
      },
      commandConfig: {},
      runningJobs: new Map(),
      deps: {
        buildWorkspacePrompt: async (prompt) => prompt,
        startCliTurn: () => ({
          child: { pid: 123 },
          result: Promise.resolve({
            ok: false,
            output: "boom",
            stderr: "",
            exitCode: 1,
          }),
        }),
        markRunRunning: async () => {},
        markRunFailed: async (...args) => calls.push(["failed", ...args]),
        settleFailedRunBilling: async () => {
          throw new Error("refund store down");
        },
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.messageText, /Codex failed \(exit 1\)/);
    assert.deepEqual(calls, [
      ["failed", "run_1", "boom", {
        codexThreadId: "",
        outputPreview: result.messageText.slice(0, 500),
      }, "/tmp/bot"],
    ]);
  });
});
