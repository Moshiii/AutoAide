import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

import { importFresh, withTempHome } from "../helpers/module.js";

async function waitForAuditEvents(audit, expectedCount, filter = {}) {
  let events = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    events = await audit.listRuntimeAuditEvents(filter);
    if (events.length >= expectedCount) {
      break;
    }
    await sleep(10);
  }
  return events;
}

test("run admission preserves busy rejection when queue is disabled", async () => {
  const { createRunCoordinator } = await importFresh("../../src/runtime/run-coordinator.mjs");
  const { submitPreparedRun } = await importFresh("../../src/runtime/run-admission.mjs");
  const coordinator = createRunCoordinator({ queueEnabled: false });
  coordinator.setActive("session-a", { pid: 123 });

  const submitted = submitPreparedRun({
    coordinator,
    routeKey: "session-a",
    prepared: {
      run: {
        runId: "run_busy",
      },
    },
  });

  assert.equal(submitted.ok, false);
  assert.equal(submitted.status, "busy");
  assert.equal(submitted.reason, "running_session");
});

test("run admission queues a deferred prepared request without charging", async () => {
  await withTempHome(async () => {
    const { createRunCoordinator } = await importFresh("../../src/runtime/run-coordinator.mjs");
    const { prepareChatRequest } = await importFresh("../../src/chat-request-service.mjs");
    const { submitPreparedRun, dequeuePreparedRun, chargeAdmittedRun } = await importFresh("../../src/runtime/run-admission.mjs");
    const ledger = await importFresh("../../src/usage-ledger.mjs");
    const coordinator = createRunCoordinator({ queueEnabled: true });
    const logs = [];
    coordinator.setActive("session-a", { pid: 123 });

    const prepared = await prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m-queued",
      deferCharge: true,
    });
    const submitted = submitPreparedRun({
      coordinator,
      routeKey: "session-a",
      prepared,
      logEvent: (event, details) => logs.push([event, details]),
    });
    const beforeCharge = await ledger.listUsageEvents({ userId: "telegram:1" });

    assert.equal(submitted.ok, true);
    assert.equal(submitted.status, "queued");
    assert.equal(submitted.charged, null);
    assert.equal(beforeCharge.length, 0);

    coordinator.clearActive("session-a");
    const dequeued = dequeuePreparedRun({
      coordinator,
      routeKey: "session-a",
      logEvent: (event, details) => logs.push([event, details]),
    });
    const admitted = await chargeAdmittedRun(dequeued);
    const afterCharge = await ledger.listUsageEvents({ userId: "telegram:1" });

    assert.equal(admitted.ok, true);
    assert.equal(admitted.status, "ready");
    assert.equal(admitted.charged.costSource, "daily_free");
    assert.equal(afterCharge.length, 1);
    assert.deepEqual(logs.map(([event]) => event), ["queue enqueued", "queue dequeued"]);
  });
});

test("run admission persists queue and billing audit events", async () => {
  await withTempHome(async () => {
    const { createRunCoordinator } = await importFresh("../../src/runtime/run-coordinator.mjs");
    const { prepareChatRequest } = await importFresh("../../src/chat-request-service.mjs");
    const { submitPreparedRun, dequeuePreparedRun, chargeAdmittedRun } = await importFresh("../../src/runtime/run-admission.mjs");
    const audit = await importFresh("../../src/runtime-audit-log.mjs");
    const coordinator = createRunCoordinator({ queueEnabled: true });
    coordinator.setActive("session-a", { pid: 123 });

    const prepared = await prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m-audit",
      deferCharge: true,
    });

    const submitted = submitPreparedRun({
      coordinator,
      routeKey: "session-a",
      prepared,
      runtimeAudit: true,
    });
    coordinator.clearActive("session-a");
    const dequeued = dequeuePreparedRun({
      coordinator,
      routeKey: "session-a",
      runtimeAudit: true,
    });
    await chargeAdmittedRun(dequeued, {
      runtimeAudit: true,
    });

    assert.equal(submitted.status, "queued");
    const events = await waitForAuditEvents(audit, 3, { runId: prepared.run.runId });

    assert.deepEqual(events.map((entry) => entry.event).sort(), [
      "queue enqueued",
      "queue dequeued",
      "billing charged",
    ].sort());
    const enqueuedAudit = events.find((entry) => entry.event === "queue enqueued");
    const chargedAudit = events.find((entry) => entry.event === "billing charged");
    assert.equal(enqueuedAudit.routeKey, "session-a");
    assert.equal(enqueuedAudit.position, 1);
    assert.equal(enqueuedAudit.channel, "telegram");
    assert.equal(enqueuedAudit.userId, "telegram:1");
    assert.equal(chargedAudit.costSource, "daily_free");
  });
});

test("run admission reports queue full without charging", async () => {
  await withTempHome(async () => {
    const { createRunCoordinator } = await importFresh("../../src/runtime/run-coordinator.mjs");
    const { prepareChatRequest } = await importFresh("../../src/chat-request-service.mjs");
    const { submitPreparedRun } = await importFresh("../../src/runtime/run-admission.mjs");
    const ledger = await importFresh("../../src/usage-ledger.mjs");
    const coordinator = createRunCoordinator({ queueEnabled: true, perKeyLimit: 1 });
    coordinator.setActive("session-a", { pid: 123 });

    const first = await prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m-first",
      deferCharge: true,
    });
    const second = await prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m-second",
      deferCharge: true,
    });

    assert.equal(submitPreparedRun({ coordinator, routeKey: "session-a", prepared: first }).status, "queued");
    const rejected = submitPreparedRun({ coordinator, routeKey: "session-a", prepared: second });
    const events = await ledger.listUsageEvents({ userId: "telegram:1" });

    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.reason, "queue_full");
    assert.equal(events.length, 0);
  });
});

test("run admission audits queue rejection and cancellation", async () => {
  await withTempHome(async () => {
    const { createRunCoordinator } = await importFresh("../../src/runtime/run-coordinator.mjs");
    const { prepareChatRequest } = await importFresh("../../src/chat-request-service.mjs");
    const { submitPreparedRun, cancelPreparedRun } = await importFresh("../../src/runtime/run-admission.mjs");
    const audit = await importFresh("../../src/runtime-audit-log.mjs");
    const coordinator = createRunCoordinator({ queueEnabled: true, perKeyLimit: 1 });
    coordinator.setActive("session-a", { pid: 123 });

    const first = await prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m-first",
      deferCharge: true,
    });
    const second = await prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m-second",
      deferCharge: true,
    });

    submitPreparedRun({ coordinator, routeKey: "session-a", prepared: first, runtimeAudit: true });
    const rejected = submitPreparedRun({ coordinator, routeKey: "session-a", prepared: second, runtimeAudit: true });
    const cancelled = cancelPreparedRun({
      coordinator,
      routeKey: "session-a",
      id: first.run.runId,
      runtimeAudit: true,
    });

    assert.equal(rejected.status, "rejected");
    assert.equal(cancelled.runId, first.run.runId);
    const events = await waitForAuditEvents(audit, 3);

    assert.deepEqual(events.map((entry) => entry.event).sort(), [
      "queue enqueued",
      "queue cancelled",
      "queue rejected",
    ].sort());
    const rejectedAudit = events.find((entry) => entry.event === "queue rejected");
    const cancelledAudit = events.find((entry) => entry.event === "queue cancelled");
    assert.equal(rejectedAudit.errorCode, "queue_full");
    assert.equal(rejectedAudit.reason, "queue_full");
    assert.equal(cancelledAudit.runId, first.run.runId);
  });
});
