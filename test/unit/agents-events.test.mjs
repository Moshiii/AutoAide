import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { importFresh } from "../helpers/module.js";

const FIXTURES = path.resolve("test/fixtures/codex");

async function readFixtureEvents(filename) {
  const raw = await readFile(path.join(FIXTURES, filename), "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("normalizeCodexCliEvent maps thread start and final messages to AgentEvent", async () => {
  const { AgentEventType, normalizeCodexCliEvent } = await importFresh("../../src/agents/events.mjs");
  const [threadStarted] = await readFixtureEvents("thread-started.ndjson");
  const [finalMessage] = await readFixtureEvents("final-message.ndjson");

  const sessionEvent = normalizeCodexCliEvent(threadStarted, {
    runId: "run_1",
    sessionKey: "feishu:user:ou_fixture_user",
    createdAt: "2026-06-25T00:00:00.000Z",
  });
  const messageEvent = normalizeCodexCliEvent(finalMessage, {
    createdAt: "2026-06-25T00:00:01.000Z",
  });

  assert.equal(sessionEvent.type, AgentEventType.SESSION_STARTED);
  assert.equal(sessionEvent.runId, "run_1");
  assert.equal(sessionEvent.sessionKey, "feishu:user:ou_fixture_user");
  assert.equal(sessionEvent.payload.cliSessionRef, "thread_fixture_1");
  assert.equal(messageEvent.type, AgentEventType.MESSAGE_COMPLETED);
  assert.equal(messageEvent.payload.text, "Done from fixture.");
});

test("normalizeCodexCliEvent maps tool and command lifecycle events", async () => {
  const { AgentEventType, normalizeCodexCliEvent, summarizeCodexCliEvent } = await importFresh("../../src/agents/events.mjs");
  const toolEvents = await readFixtureEvents("tool-call.ndjson");
  const commandEvents = await readFixtureEvents("command-exec.ndjson");

  const normalized = [...toolEvents, ...commandEvents].map((event) => normalizeCodexCliEvent(event, {
    createdAt: "2026-06-25T00:00:00.000Z",
  }));

  assert.deepEqual(normalized.map((event) => event.type), [
    AgentEventType.TOOL_STARTED,
    AgentEventType.TOOL_COMPLETED,
    AgentEventType.COMMAND_STARTED,
    AgentEventType.COMMAND_COMPLETED,
  ]);
  assert.equal(normalized[0].payload.label, "read_file");
  assert.equal(normalized[2].payload.command, "npm test -- --runInBand");
  assert.equal(summarizeCodexCliEvent(toolEvents[0]), "Using read_file...");
  assert.equal(summarizeCodexCliEvent(commandEvents[1]), "Finished npm test -- --runInBand.");
});

test("parseCodexCliEventLine ignores invalid lines", async () => {
  const { parseCodexCliEventLine } = await importFresh("../../src/agents/events.mjs");

  assert.equal(parseCodexCliEventLine(""), null);
  assert.equal(parseCodexCliEventLine("not-json"), null);
  assert.equal(parseCodexCliEventLine("{\"type\":\"unknown.event\"}")?.type, "raw");
});
