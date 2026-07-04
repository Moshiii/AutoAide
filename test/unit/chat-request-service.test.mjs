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

test("prepareChatRequest creates user, queued run, and daily-free charge for group chat", async () => {
  await withTempHome(async () => {
    const service = await importFresh("../../src/chat-request-service.mjs");
    const runs = await importFresh("../../src/run-service.mjs");
    const ledger = await importFresh("../../src/usage-ledger.mjs");

    const result = await service.prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      displayName: "@demo",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
        conversationId: "telegram:group:-100:user:1",
      },
      chatId: "-100",
      messageId: "m1",
    });

    assert.equal(result.ok, true);
    assert.equal(result.user.id, "telegram:1");
    assert.equal(result.run.status, "queued");
    assert.equal(result.charged.costSource, "daily_free");
    const latestRun = await runs.getRunRecord(result.run.runId);
    const events = await ledger.listUsageEvents({ userId: "telegram:1" });
    assert.equal(latestRun.status, "queued");
    assert.equal(events[0].runId, result.run.runId);
  });
});

test("prepareChatRequest audits immediate billing results", async () => {
  await withTempHome(async () => {
    const service = await importFresh("../../src/chat-request-service.mjs");
    const audit = await importFresh("../../src/runtime-audit-log.mjs");

    const result = await service.prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m-audit-charge",
      runtimeAudit: true,
    });

    const events = await waitForAuditEvents(audit, 1, { runId: result.run.runId });

    assert.equal(result.ok, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "billing charged");
    assert.equal(events[0].channel, "telegram");
    assert.equal(events[0].userId, "telegram:1");
    assert.equal(events[0].costSource, "daily_free");
  });
});

test("prepareChatRequest can defer billing until a pending request starts", async () => {
  await withTempHome(async () => {
    const service = await importFresh("../../src/chat-request-service.mjs");
    const ledger = await importFresh("../../src/usage-ledger.mjs");
    const runs = await importFresh("../../src/run-service.mjs");

    const prepared = await service.prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m-pending",
      deferCharge: true,
    });
    const beforeCharge = await ledger.listUsageEvents({ userId: "telegram:1" });

    assert.equal(prepared.ok, true);
    assert.equal(prepared.decision, "pending_charge");
    assert.equal(prepared.charged, null);
    assert.equal(beforeCharge.length, 0);

    const charged = await service.chargePreparedChatRequest(prepared);
    const afterCharge = await ledger.listUsageEvents({ userId: "telegram:1" });
    const latestRun = await runs.getRunRecord(prepared.run.runId);

    assert.equal(charged.ok, true);
    assert.equal(charged.decision, "ready");
    assert.equal(charged.charged.costSource, "daily_free");
    assert.equal(afterCharge.length, 1);
    assert.equal(afterCharge[0].runId, prepared.run.runId);
    assert.equal(latestRun.status, "queued");
  });
});

test("chargePreparedChatRequest denies a deferred run when credits are unavailable", async () => {
  await withTempHome(async () => {
    const service = await importFresh("../../src/chat-request-service.mjs");
    const credits = await importFresh("../../src/user-credits.mjs");
    const runs = await importFresh("../../src/run-service.mjs");

    for (let index = 0; index < credits.DEFAULT_DAILY_FREE_LIMIT; index += 1) {
      await service.prepareChatRequest({
        channel: "telegram",
        externalUserId: "1",
        envelope: {
          channel: "telegram",
          userId: "1",
          chatType: "group",
        },
        chatId: "-100",
        messageId: `m-used-${index}`,
      });
    }

    const prepared = await service.prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m-deferred-deny",
      deferCharge: true,
    });
    const charged = await service.chargePreparedChatRequest(prepared);
    const latestRun = await runs.getRunRecord(prepared.run.runId);

    assert.equal(prepared.ok, true);
    assert.equal(charged.ok, false);
    assert.equal(charged.reason, "insufficient_credits");
    assert.equal(latestRun.status, "denied");
  });
});

test("prepareChatRequest denies locked private chat without charging", async () => {
  await withTempHome(async () => {
    const service = await importFresh("../../src/chat-request-service.mjs");
    const ledger = await importFresh("../../src/usage-ledger.mjs");

    const result = await service.prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "direct",
        isDirect: true,
      },
      chatId: "1",
      messageId: "m1",
    });
    const events = await ledger.listUsageEvents({ userId: "telegram:1" });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "private_chat_locked");
    assert.match(result.message, /No credits were charged/);
    assert.match(result.message, /Next:/);
    assert.match(result.message, /keep using CodexBridge in the group/);
    assert.match(result.message, /Group chat is public/);
    assert.match(result.message, /avoid private or sensitive content/);
    assert.match(result.message, /unlock private chat/);
    assert.equal(result.run.status, "denied");
    assert.equal(events.length, 0);
  });
});

test("prepareChatRequest blocks obvious secrets before charging", async () => {
  await withTempHome(async () => {
    const service = await importFresh("../../src/chat-request-service.mjs");
    const ledger = await importFresh("../../src/usage-ledger.mjs");

    const result = await service.prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m-secret",
      content: "Please use sk-1234567890abcdef for this request.",
    });
    const events = await ledger.listUsageEvents({ userId: "telegram:1" });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "conversation_policy_blocked");
    assert.match(result.message, /No credits were charged/);
    assert.match(result.message, /Remove the credential/);
    assert.equal(result.run.status, "denied");
    assert.equal(result.policy.action, "block");
    assert.equal(result.policy.blockingLabels.includes("possible_secret"), true);
    assert.equal(events.length, 0);
  });
});

test("prepareChatRequest audits conversation policy denial", async () => {
  await withTempHome(async () => {
    const service = await importFresh("../../src/chat-request-service.mjs");
    const audit = await importFresh("../../src/runtime-audit-log.mjs");

    const result = await service.prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m-secret-audit",
      content: "Please use sk-1234567890abcdef for this request.",
      runtimeAudit: true,
    });

    const events = await waitForAuditEvents(audit, 1, { runId: result.run.runId });

    assert.equal(result.ok, false);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, "policy denied");
    assert.equal(events[0].errorCode, "conversation_policy_blocked");
    assert.equal(events[0].policyAction, "block");
    assert.deepEqual(events[0].blockingLabels, ["possible_secret"]);
    assert.equal("content" in events[0], false);
  });
});

test("prepareChatRequest denies group chat after free quota when paid credits are empty", async () => {
  await withTempHome(async () => {
    const service = await importFresh("../../src/chat-request-service.mjs");
    const credits = await importFresh("../../src/user-credits.mjs");
    const ledger = await importFresh("../../src/usage-ledger.mjs");

    let result = null;
    for (let index = 0; index <= credits.DEFAULT_DAILY_FREE_LIMIT; index += 1) {
      result = await service.prepareChatRequest({
        channel: "telegram",
        externalUserId: "1",
        envelope: {
          channel: "telegram",
          userId: "1",
          chatType: "group",
        },
        chatId: "-100",
        messageId: `m${index}`,
      });
    }
    const events = await ledger.listUsageEvents({ userId: "telegram:1" });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "insufficient_credits");
    assert.match(result.message, /No credits were charged/);
    assert.match(result.message, /Daily free remaining: 0/);
    assert.match(result.message, /Next: top up paid credits/);
    assert.equal(result.run.status, "denied");
    assert.equal(events.at(-1).eventType, "deny");
  });
});

test("prepareChatRequest returns actionable banned user message", async () => {
  await withTempHome(async () => {
    const service = await importFresh("../../src/chat-request-service.mjs");
    const users = await importFresh("../../src/users-state.mjs");

    await users.upsertUser({
      channel: "telegram",
      externalUserId: "1",
      status: "banned",
    });

    const result = await service.prepareChatRequest({
      channel: "telegram",
      externalUserId: "1",
      envelope: {
        channel: "telegram",
        userId: "1",
        chatType: "group",
      },
      chatId: "-100",
      messageId: "m1",
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "user_banned");
    assert.match(result.message, /blocked from using CodexBridge/);
    assert.match(result.message, /No credits were charged/);
    assert.match(result.message, /ask the operator/);
  });
});
