import test from "node:test";
import assert from "node:assert/strict";

import { importFresh, withTempHome } from "../helpers/module.js";

test("web chat service runs a prompt and reports workspace changes", async () => {
  const previousStartCommand = process.env.CODEX_START_COMMAND;
  try {
    await withTempHome(async () => {
      process.env.CODEX_START_COMMAND = "printf '# Report\\n' > report.md; printf '%s\\n' '{\"type\":\"thread.started\",\"thread_id\":\"web-chat-thread\"}' '{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"Created report.md.\"}}'";
      const { createBot, inspectBot } = await importFresh("../../src/bots.mjs");
      const { createWebChatService } = await importFresh("../../src/web-chat-service.mjs");
      await createBot({ id: "web-chat", name: "Web Chat" });

      const service = createWebChatService({
        resolveBotHome: async (botId) => (await inspectBot(botId)).bot.homePath,
      });
      const started = await service.startBotChat("web-chat", {
        prompt: "Create report.md",
        sessionLabel: "main",
      });
      assert.equal(started.status, "running");
      assert.equal(started.sessionLabel, "main");

      await new Promise((resolve) => setTimeout(resolve, 50));
      const status = await service.readChatStatus("web-chat", "main");
      assert.equal(status.status, "completed");
      assert.equal(status.output, "Created report.md.");
      assert.equal(status.workspaceChanges.length, 1);
      assert.equal(status.workspaceChanges[0].path, "report.md");
      assert.equal(status.workspaceChanges[0].changeType, "new");
    });
  } finally {
    if (previousStartCommand == null) {
      delete process.env.CODEX_START_COMMAND;
    } else {
      process.env.CODEX_START_COMMAND = previousStartCommand;
    }
  }
});

test("web chat service rejects a second prompt while a session is running", async () => {
  const previousStartCommand = process.env.CODEX_START_COMMAND;
  try {
    await withTempHome(async () => {
      process.env.CODEX_START_COMMAND = "node -e \"setTimeout(() => console.log('{\\\"type\\\":\\\"item.completed\\\",\\\"item\\\":{\\\"type\\\":\\\"agent_message\\\",\\\"text\\\":\\\"done\\\"}}'), 200)\"";
      const { createBot, inspectBot } = await importFresh("../../src/bots.mjs");
      const { createWebChatService } = await importFresh("../../src/web-chat-service.mjs");
      await createBot({ id: "busy-chat", name: "Busy Chat" });

      const service = createWebChatService({
        resolveBotHome: async (botId) => (await inspectBot(botId)).bot.homePath,
      });
      await service.startBotChat("busy-chat", { prompt: "first", sessionLabel: "main" });
      await assert.rejects(
        () => service.startBotChat("busy-chat", { prompt: "second", sessionLabel: "main" }),
        /already running/,
      );
    });
  } finally {
    if (previousStartCommand == null) {
      delete process.env.CODEX_START_COMMAND;
    } else {
      process.env.CODEX_START_COMMAND = previousStartCommand;
    }
  }
});

test("web chat service can use RunExecutor behind migration flag", async () => {
  const previousStartCommand = process.env.CODEX_START_COMMAND;
  const previousRunExecutor = process.env.CODEXBRIDGE_RUN_EXECUTOR;
  try {
    await withTempHome(async () => {
      process.env.CODEXBRIDGE_RUN_EXECUTOR = "1";
      process.env.CODEX_START_COMMAND = "printf '# Executor Report\\n' > executor-report.md; printf '%s\\n' '{\"type\":\"thread.started\",\"thread_id\":\"web-executor-thread\"}' '{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"Created executor-report.md.\"}}'";
      const { createBot, inspectBot } = await importFresh("../../src/bots.mjs");
      const { listRunRecords } = await importFresh("../../src/run-service.mjs");
      const { createWebChatService } = await importFresh("../../src/web-chat-service.mjs");
      await createBot({ id: "web-executor-chat", name: "Web Executor Chat" });
      const botHomeFor = async (botId) => (await inspectBot(botId)).bot.homePath;

      const service = createWebChatService({
        resolveBotHome: botHomeFor,
      });
      const started = await service.startBotChat("web-executor-chat", {
        prompt: "Create executor-report.md",
        sessionLabel: "main",
      });
      assert.equal(started.status, "running");

      await new Promise((resolve) => setTimeout(resolve, 80));
      const status = await service.readChatStatus("web-executor-chat", "main");
      assert.equal(status.status, "completed");
      assert.equal(status.output, "Created executor-report.md.");
      assert.equal(status.workspaceChanges[0].path, "executor-report.md");

      const runs = await listRunRecords({ botHome: await botHomeFor("web-executor-chat") });
      assert.equal(runs.length, 1);
      assert.equal(runs[0].channel, "web");
      assert.equal(runs[0].status, "completed");
      assert.equal(runs[0].outputPreview, "Created executor-report.md.");
    });
  } finally {
    if (previousStartCommand == null) {
      delete process.env.CODEX_START_COMMAND;
    } else {
      process.env.CODEX_START_COMMAND = previousStartCommand;
    }
    if (previousRunExecutor == null) {
      delete process.env.CODEXBRIDGE_RUN_EXECUTOR;
    } else {
      process.env.CODEXBRIDGE_RUN_EXECUTOR = previousRunExecutor;
    }
  }
});
