import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("Feishu card renderer renders run state snapshots", async () => {
  const {
    FEISHU_CARD_STATE,
  } = await importFresh("../../src/feishu/cards.mjs");
  const {
    renderFeishuRunCard,
  } = await importFresh("../../src/feishu/card-renderer.mjs");

  const queued = renderFeishuRunCard({
    state: FEISHU_CARD_STATE.QUEUED,
    title: "CodexBridge",
    sessionLabel: "main",
    summary: "Waiting for the current turn.",
  });
  assert.equal(queued.header.template, "blue");
  assert.equal(queued.header.title.content, "CodexBridge");
  assert.equal(queued.elements[0].content, "**Status:** Queued");

  const running = renderFeishuRunCard({
    state: FEISHU_CARD_STATE.USING_TOOL,
    events: [
      { type: "tool.started", payload: { summary: "Using rg..." } },
    ],
  });
  assert.equal(running.header.template, "wathet");
  assert.match(running.elements.at(-1).content, /Using rg/);

  const completed = renderFeishuRunCard({
    state: FEISHU_CARD_STATE.COMPLETED,
    outputText: "Done.",
  });
  assert.equal(completed.header.template, "green");
  assert.match(completed.elements.at(-1).content, /Done/);

  const failed = renderFeishuRunCard({
    state: FEISHU_CARD_STATE.FAILED,
    errorText: "Boom",
  });
  assert.equal(failed.header.template, "red");
  assert.match(failed.elements.at(-1).content, /Boom/);

  const stopped = renderFeishuRunCard({
    state: FEISHU_CARD_STATE.STOPPED,
  });
  assert.equal(stopped.header.template, "grey");
  assert.equal(stopped.elements[0].content, "**Status:** Stopped");
});

test("Feishu card renderer maps agent events and truncates long text", async () => {
  const {
    renderFeishuCardForAgentEvent,
    truncateFeishuCardText,
  } = await importFresh("../../src/feishu/card-renderer.mjs");
  const longText = "x".repeat(2200);

  const card = renderFeishuCardForAgentEvent({
    type: "message.completed",
    payload: { text: longText },
  });

  assert.equal(card.header.template, "green");
  assert.ok(card.elements.at(-1).content.length < 1900);
  assert.match(card.elements.at(-1).content, /truncated/);
  assert.equal(truncateFeishuCardText("short"), "short");
});

test("Feishu card renderer renders permission action buttons", async () => {
  const { renderFeishuCardForAgentEvent } = await importFresh("../../src/feishu/card-renderer.mjs");

  const card = renderFeishuCardForAgentEvent({
    type: "permission.requested",
    payload: {
      permission: {
        runId: "run_1",
        actionId: "act_1",
        userId: "feishu:user_1",
        nonce: "nonce_1",
        createdAt: "2026-06-25T07:59:00.000Z",
        expiresAt: "2026-06-25T08:05:00.000Z",
        payloadHash: "hash_1",
        signature: "sig_1",
        summary: "Run npm test",
      },
    },
  });

  assert.equal(card.header.template, "orange");
  const action = card.elements.at(-1);
  assert.equal(action.tag, "action");
  assert.deepEqual(action.actions.map((button) => button.value.action), [
    "permission.allow",
    "permission.deny",
  ]);
  assert.equal(action.actions[0].value.signature, "sig_1");
  assert.equal(action.actions[0].value.payloadHash, "hash_1");
  assert.equal(action.actions[1].value.userId, "feishu:user_1");
});
