import test from "node:test";
import assert from "node:assert/strict";

import { importFresh, withTempHome } from "../helpers/module.js";

test("runtime audit event keeps only approved observability fields", async () => {
  const audit = await importFresh("../../src/runtime-audit-log.mjs");

  const event = audit.createRuntimeAuditEvent({
    event: "run failed",
    details: {
      runId: "run_1",
      sessionKey: "telegram:chat:-100:user:111",
      channel: "telegram",
      userId: "telegram:111",
      chatId: "-100",
      botHome: "/tmp/bot",
      durationMs: 15,
      errorCode: "agent_failed",
      actionId: "act_1",
      prompt: "do not log this",
      token: "secret-token",
      apiSecret: "secret",
      featureFlags: {
        runExecutor: {
          env: "CODEXBRIDGE_RUN_EXECUTOR",
          enabled: true,
          secret: "drop-me",
        },
      },
    },
  });

  assert.deepEqual(event, {
    event: "run failed",
    runId: "run_1",
    sessionKey: "telegram:chat:-100:user:111",
    channel: "telegram",
    userId: "telegram:111",
    chatId: "-100",
    botHome: "/tmp/bot",
    featureFlags: {
      runExecutor: {
        env: "CODEXBRIDGE_RUN_EXECUTOR",
        enabled: true,
      },
    },
    durationMs: 15,
    errorCode: "agent_failed",
    actionId: "act_1",
  });
  assert.equal("prompt" in event, false);
  assert.equal("token" in event, false);
  assert.equal("apiSecret" in event, false);
});

test("runtime audit log appends and filters JSONL events", async () => {
  await withTempHome(async () => {
    const audit = await importFresh("../../src/runtime-audit-log.mjs");

    await audit.appendRuntimeAuditEvent({
      event: "run started",
      details: {
        runId: "run_1",
        channel: "feishu",
      },
    });
    await audit.appendRuntimeAuditEvent({
      event: "run failed",
      details: {
        runId: "run_2",
        channel: "telegram",
        errorCode: "boom",
      },
    });

    const all = await audit.listRuntimeAuditEvents();
    const failed = await audit.listRuntimeAuditEvents({ event: "run failed" });
    const runOne = await audit.listRuntimeAuditEvents({ runId: "run_1" });

    assert.deepEqual(all.map((entry) => entry.event), ["run started", "run failed"]);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].errorCode, "boom");
    assert.equal(runOne.length, 1);
    assert.equal(runOne[0].channel, "feishu");
  });
});
