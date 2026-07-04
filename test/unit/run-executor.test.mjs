import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import { importFresh, withTempHome } from "../helpers/module.js";

test("run executor drives queued, running, and completed lifecycle with events", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    const runs = await importFresh("../../src/run-service.mjs");
    const seenEvents = [];

    const result = await executeRun({
      record: {
        userId: "telegram:1",
        channel: "telegram",
        chatType: "group",
      },
      agentRequest: {
        prompt: "hello",
      },
      onEvent: (event) => seenEvents.push(event),
    }, {
      agentAdapter: {
        async runTurn(request, handlers) {
          handlers.onEvent({
            type: "message.completed",
            payload: { text: "done" },
          });
          return {
            ok: true,
            output: `done ${request.runId}`,
            cliSessionRef: "thread_1",
          };
        },
      },
    });

    const latest = await runs.getRunRecord(result.run.runId);

    assert.equal(result.run.status, "completed");
    assert.equal(result.run.codexThreadId, "thread_1");
    assert.match(result.run.outputPreview, /^done /);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].runId, result.run.runId);
    assert.equal(seenEvents[0].runId, result.run.runId);
    assert.equal(latest.events[0].type, "message.completed");
  });
});

test("run executor emits structured lifecycle log events when a logger is provided", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    const logs = [];

    const result = await executeRun({
      record: {
        userId: "telegram:1",
        channel: "telegram",
        chatType: "group",
        chatId: "-100",
      },
      agentRequest: {
        prompt: "hello",
        sessionKey: "telegram:-100:main",
      },
      logEvent: (entry) => logs.push(entry),
      env: {
        CODEXBRIDGE_RUN_EXECUTOR: "1",
      },
    }, {
      agentAdapter: {
        async runTurn() {
          return {
            ok: true,
            output: "done",
            cliSessionRef: "thread_1",
          };
        },
      },
    });

    assert.equal(result.run.status, "completed");
    assert.deepEqual(logs.map((entry) => entry.event), [
      "run created",
      "run started",
      "run completed",
    ]);
    assert.equal(logs[0].details.runId, result.run.runId);
    assert.equal(logs[0].details.channel, "telegram");
    assert.equal(logs[0].details.userId, "telegram:1");
    assert.equal(logs[0].details.chatId, "-100");
    assert.equal(logs[0].details.sessionKey, "telegram:-100:main");
    assert.equal(logs[0].details.featureFlags.runExecutor.enabled, true);
    assert.equal(Number.isFinite(logs[0].details.durationMs), true);
    assert.equal(logs[0].details.errorCode, "");
  });
});

test("run executor can persist runtime audit lifecycle events", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    const audit = await importFresh("../../src/runtime-audit-log.mjs");

    const result = await executeRun({
      runtimeAudit: true,
      record: {
        userId: "telegram:1",
        channel: "telegram",
        chatType: "group",
        chatId: "-100",
      },
      agentRequest: {
        prompt: "this prompt must not be persisted",
        sessionKey: "telegram:-100:main",
      },
      env: {
        CODEXBRIDGE_RUN_EXECUTOR: "1",
      },
    }, {
      agentAdapter: {
        async runTurn() {
          return {
            ok: true,
            output: "done",
            cliSessionRef: "thread_1",
          };
        },
      },
    });

    let events = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      events = await audit.listRuntimeAuditEvents({ runId: result.run.runId });
      if (events.length >= 3) {
        break;
      }
      await sleep(10);
    }

    assert.deepEqual(events.map((entry) => entry.event), [
      "run created",
      "run started",
      "run completed",
    ]);
    assert.equal(events[0].runId, result.run.runId);
    assert.equal(events[0].sessionKey, "telegram:-100:main");
    assert.equal(events[0].featureFlags.runExecutor.enabled, true);
    assert.equal("prompt" in events[0], false);
  });
});

test("run executor marks failed runs and settles failed billing", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    const settled = [];

    const result = await executeRun({
      record: {
        userId: "telegram:2",
        channel: "telegram",
      },
      billing: {
        userId: "telegram:2",
        chargeResult: { paidCreditsCharged: 1 },
      },
    }, {
      settleFailedRunBilling: async (payload) => {
        settled.push(payload);
        return { ok: true, refunded: 1 };
      },
      agentAdapter: {
        async runTurn() {
          return {
            ok: false,
            error: "boom",
          };
        },
      },
    });

    assert.equal(result.run.status, "failed");
    assert.equal(result.run.error, "boom");
    assert.equal(settled.length, 1);
    assert.equal(settled[0].failureType, "failed");
    assert.equal(settled[0].runId, result.run.runId);
  });
});

test("run executor logs billing settlement and failure outcome", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    const logs = [];

    const result = await executeRun({
      record: {
        userId: "telegram:2",
        channel: "telegram",
      },
      billing: {
        userId: "telegram:2",
        chargeResult: { paidCreditsCharged: 1 },
      },
      logEvent: (entry) => logs.push(entry),
    }, {
      settleFailedRunBilling: async () => ({ ok: true, refunded: 1 }),
      agentAdapter: {
        async runTurn() {
          return {
            ok: false,
            error: "boom",
          };
        },
      },
    });

    assert.equal(result.run.status, "failed");
    assert.equal(logs.some((entry) => entry.event === "billing refunded"), true);
    const failed = logs.find((entry) => entry.event === "run failed");
    assert.equal(failed.level, "error");
    assert.equal(failed.details.errorCode, "boom");
  });
});

test("run executor marks stopped runs without failed billing settlement", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    let settled = false;

    const result = await executeRun({
      record: {
        userId: "telegram:3",
      },
    }, {
      settleFailedRunBilling: async () => {
        settled = true;
      },
      agentAdapter: {
        async runTurn() {
          return {
            ok: false,
            stopped: true,
          };
        },
      },
    });

    assert.equal(result.run.status, "stopped");
    assert.equal(result.run.reason, "user_stop");
    assert.equal(settled, false);
  });
});

test("run executor can execute an already prepared run without creating another run", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    const runs = await importFresh("../../src/run-service.mjs");
    const prepared = await runs.createQueuedRun({
      userId: "feishu:ou_1",
      channel: "feishu",
      chatType: "group",
      agentProvider: "codex-cli",
    });
    let createCalled = false;

    const result = await executeRun({
      run: prepared,
    }, {
      runServices: {
        createQueuedRun: async () => {
          createCalled = true;
          throw new Error("unexpected create");
        },
        markRunRunning: runs.markRunRunning,
        markRunCompleted: runs.markRunCompleted,
        markRunFailed: runs.markRunFailed,
        markRunStopped: runs.markRunStopped,
      },
      agentAdapter: {
        async runTurn() {
          return {
            ok: true,
            output: "prepared done",
            cliSessionRef: "thread_prepared",
          };
        },
      },
    });

    assert.equal(createCalled, false);
    assert.equal(result.run.runId, prepared.runId);
    assert.equal(result.run.status, "completed");
    assert.equal(result.run.codexThreadId, "thread_prepared");
  });
});

test("run executor records failed run even when billing settlement fails", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");

    const result = await executeRun({
      record: {
        userId: "telegram:4",
      },
    }, {
      settleFailedRunBilling: async () => {
        throw new Error("refund unavailable");
      },
      agentAdapter: {
        async runTurn() {
          return {
            ok: false,
            error: "agent failed",
          };
        },
      },
    });

    assert.equal(result.run.status, "failed");
    assert.equal(result.run.error, "agent failed");
  });
});

test("run executor waits for permission broker before completing", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");

    const result = await executeRun({
      record: {
        userId: "feishu:ou_1",
      },
      permissionBroker: {
        waitForPermission: async (request) => {
          assert.equal(Boolean(request.runId), true);
          assert.equal(request.actionId, "act_1");
          return { ok: true, decision: "allow" };
        },
      },
    }, {
      agentAdapter: {
        async runTurn(_request, handlers) {
          handlers.onEvent({
            type: "permission.requested",
            payload: {
              permission: {
                actionId: "act_1",
              },
            },
          });
          return {
            ok: true,
            output: "done after allow",
          };
        },
      },
    });

    assert.equal(result.run.status, "completed");
    assert.equal(result.run.outputPreview, "done after allow");
  });
});

test("run executor stops when permission broker denies", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    let settled = false;

    const result = await executeRun({
      record: {
        userId: "feishu:ou_1",
      },
      permissionBroker: {
        waitForPermission: async () => ({ ok: false, decision: "deny", reason: "permission_denied" }),
      },
    }, {
      settleFailedRunBilling: async () => {
        settled = true;
      },
      agentAdapter: {
        async runTurn(_request, handlers) {
          handlers.onEvent({
            type: "permission.requested",
            payload: { permission: { actionId: "act_1" } },
          });
          return {
            ok: true,
            output: "should not complete",
          };
        },
      },
    });

    assert.equal(result.run.status, "stopped");
    assert.equal(result.run.reason, "permission_denied");
    assert.equal(result.result.stopped, true);
    assert.equal(settled, false);
  });
});

test("run executor logs permission broker decisions", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    const logs = [];

    const result = await executeRun({
      record: {
        userId: "feishu:ou_1",
        channel: "feishu",
      },
      logEvent: (entry) => logs.push(entry),
      permissionBroker: {
        waitForPermission: async () => ({ ok: false, decision: "deny", reason: "permission_denied" }),
      },
    }, {
      agentAdapter: {
        async runTurn(_request, handlers) {
          handlers.onEvent({
            type: "permission.requested",
            payload: { permission: { actionId: "act_1" } },
          });
          return {
            ok: true,
            output: "should not complete",
          };
        },
      },
    });

    assert.equal(result.run.status, "stopped");
    assert.equal(logs.find((entry) => entry.event === "permission requested").details.actionId, "act_1");
    const denied = logs.find((entry) => entry.event === "permission deny");
    assert.equal(denied.level, "warn");
    assert.equal(denied.details.errorCode, "permission_denied");
  });
});

test("run executor fails and settles billing when question broker times out", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    const settled = [];

    const result = await executeRun({
      record: {
        userId: "feishu:ou_1",
      },
      billing: {
        userId: "feishu:ou_1",
        chargeResult: { paidCreditsCharged: 1 },
      },
      questionBroker: {
        waitForAnswer: async () => ({ ok: false, decision: "timeout", reason: "question_timeout" }),
      },
    }, {
      settleFailedRunBilling: async (payload) => {
        settled.push(payload);
        return { ok: true };
      },
      agentAdapter: {
        async runTurn(_request, handlers) {
          handlers.onEvent({
            type: "question.requested",
            payload: { question: { questionId: "q_1" } },
          });
          return {
            ok: true,
            output: "should not complete",
          };
        },
      },
    });

    assert.equal(result.run.status, "failed");
    assert.equal(result.run.error, "question_timeout");
    assert.equal(result.result.ok, false);
    assert.equal(settled.length, 1);
    assert.equal(settled[0].failureType, "failed");
  });
});
