import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("reply renderer renders run result success, failure, stopped, and empty output", async () => {
  const { renderRunResultReply } = await importFresh("../../src/channels/reply-renderer.mjs");

  assert.equal(renderRunResultReply({ ok: true, output: "done" }), "done");
  assert.equal(renderRunResultReply({ ok: true }), "Done. No output.");
  assert.equal(renderRunResultReply({ ok: false, error: "failed" }), "failed");
  assert.equal(renderRunResultReply({ stopped: true, error: "ignored" }), "Run stopped.");
});

test("reply renderer keeps unsupported commands actionable", async () => {
  const { renderUnsupportedCommandReply } = await importFresh("../../src/channels/reply-renderer.mjs");

  assert.equal(renderUnsupportedCommandReply("/wat"), "Unsupported command: /wat\nTry /help.");
});

test("reply renderer renders queue and busy fallbacks", async () => {
  const { renderBusyReply, renderQueuedReply } = await importFresh("../../src/channels/reply-renderer.mjs");

  assert.equal(renderQueuedReply({ sessionLabel: "feishu-u-1", position: 2 }), "Queued for [feishu-u-1] at position 2.");
  assert.equal(renderQueuedReply({ routeKey: "route" }), "Queued for [route].");
  assert.equal(renderBusyReply({ sessionLabel: "telegram-u-1" }), "A request is already running on [telegram-u-1].");
});

test("reply renderer truncates long fallback text", async () => {
  const { renderTextFallback, truncateReplyText } = await importFresh("../../src/channels/reply-renderer.mjs");
  const long = "x".repeat(50);

  assert.equal(truncateReplyText(long, { maxLength: 24 }), "x".repeat(11) + "\n\n[truncated]");
  assert.equal(renderTextFallback({ title: "Title", body: long }, { maxLength: 32 }), "Title\n" + "x".repeat(13) + "\n\n[truncated]");
});

test("reply renderer prefers explicit fallback text then summary", async () => {
  const { renderTextFallback } = await importFresh("../../src/channels/reply-renderer.mjs");

  assert.equal(renderTextFallback({ fallbackText: "fallback", summary: "summary" }), "fallback");
  assert.equal(renderTextFallback({ summary: "summary" }), "summary");
  assert.equal(renderTextFallback({}), "CodexBridge update.");
});
