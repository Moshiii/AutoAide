#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startCli } from "../src/cli.mjs";
import {
  canaryRollout,
  createBot,
  deleteBot,
  ensureDefaultBot,
  getActiveBot,
  getBot,
  healthCheckBot,
  inspectBot,
  listBots,
  readBotLogs,
  restartBot,
  rollingRestartBots,
  rollbackBot,
  runBotRuntime,
  setActiveBot,
  setBotEnabled,
  startBot,
  stopBot,
  updateBotConfig,
} from "../src/bots.mjs";
import { readActiveBotId, readConfig } from "../src/config.mjs";
import { runTuiTurn } from "../src/tui-turn-service.mjs";
import {
  formatSkillInstallResult,
  formatSkillsOverview,
  installSkillFromPath,
  listSkills,
} from "../src/skills.mjs";
import {
  ensureWebRuntime,
  getWebRuntimeStatus,
  restartWebRuntime,
  runWebRuntime,
  stopWebRuntime,
} from "../src/web-runtime.mjs";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseFlags(values) {
  const flags = {};
  for (let index = 0; index < values.length; index += 1) {
    const entry = values[index];
    if (!entry.startsWith("--")) {
      continue;
    }
    const key = entry.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return flags;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function wantsHelp(...values) {
  return values.some((value) => ["--help", "-h", "help"].includes(String(value || "").trim()));
}

function printUsage() {
  console.log([
    "Usage:",
    "  codexbridge",
    "  codexbridge web [status|stop|restart] [--host <host>] [--port <port>]",
    "  codexbridge tui",
    "  codexbridge tui-turn <bot-id>",
    "  codexbridge bot <create|show|use|current|run|start|stop|restart|enable|disable|delete|logs|config|set-config|health> ...",
    "  codexbridge bots",
    "  codexbridge skills [list|install <zip-or-path>]",
    "",
    "First steps:",
    "  codexbridge web",
    "  codexbridge tui",
    "  codexbridge bot current",
    "  codexbridge bot health default",
    "",
    "Set CODEXBRIDGE_DEBUG=1 to print stack traces for unexpected errors.",
  ].join("\n"));
}

async function readStdin() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function runRatatui() {
  const manifestPath = path.join(PROJECT_ROOT, "crates", "codexbridge-tui", "Cargo.toml");
  const bridgeBin = path.join(PROJECT_ROOT, "bin", "codexbridge.mjs");
  const child = spawn("cargo", [
    "run",
    "--quiet",
    "--manifest-path",
    manifestPath,
    "--",
    "--bridge-bin",
    bridgeBin,
  ], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function printWebUsage() {
  console.log([
    "Usage:",
    "  codexbridge web [--host 127.0.0.1] [--port 8787]",
    "  codexbridge web status",
    "  codexbridge web stop",
    "  codexbridge web restart [--host 127.0.0.1] [--port 8787]",
    "",
    "Non-localhost hosts require CODEXBRIDGE_WEB_TOKEN.",
  ].join("\n"));
}

function printBotUsage() {
  console.log(
    "Usage: codexbridge bot <create|show|use|current|run|start|stop|restart|enable|disable|delete|logs|config|set-config|health> ...",
  );
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMergeConfig(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = isPlainObject(value) ? deepMergeConfig(base[key] ?? {}, value) : value;
  }
  return merged;
}

function isReadlineAbortError(error) {
  return error?.code === "ABORT_ERR" || error?.name === "AbortError";
}

async function main() {
  await ensureDefaultBot();

  const [command, subcommand, ...rest] = process.argv.slice(2);

  if (wantsHelp(command)) {
    printUsage();
    process.exit(0);
  }

  if (command === "web") {
    const flags = parseFlags([subcommand, ...rest].filter(Boolean));
    if (wantsHelp(subcommand) || flags.help || flags.h) {
      printWebUsage();
      process.exit(0);
    }
    const port = Number.parseInt(String(flags.port || "8787"), 10);
    const host = String(flags.host || "127.0.0.1");
    if (subcommand === "run") {
      await runWebRuntime({ port, host });
      await new Promise(() => {});
    }
    if (subcommand === "status") {
      printJson(await getWebRuntimeStatus());
      process.exit(0);
    }
    if (subcommand === "stop") {
      printJson(await stopWebRuntime());
      process.exit(0);
    }
    if (subcommand === "restart") {
      const runtime = await restartWebRuntime({ port, host });
      console.log(`CodexBridge control plane web running at ${runtime.url}`);
      process.exit(0);
    }
    const runtime = await ensureWebRuntime({ port, host });
    console.log(`CodexBridge control plane web running at ${runtime.url}`);
    process.exit(0);
  }

  if (command === "tui") {
    runRatatui();
    await new Promise(() => {});
  }

  if (command === "tui-turn") {
    const botId = subcommand || await readActiveBotId();
    const prompt = await readStdin();
    printJson(await runTuiTurn(botId, prompt));
    process.exit(0);
  }

  if (command === "skills") {
    if (!subcommand || subcommand === "list") {
      console.log(formatSkillsOverview(await listSkills()));
      process.exit(0);
    }
    if (subcommand === "install") {
      const source = rest.join(" ").trim();
      if (!source) {
        console.error("Usage: codexbridge skills install <zip-or-path>");
        process.exit(1);
      }
      const installed = await installSkillFromPath(source, { force: true });
      console.log(formatSkillInstallResult(installed));
      process.exit(0);
    }
    console.error("Usage: codexbridge skills [list] | codexbridge skills install <zip-or-path>");
    process.exit(1);
  }

  if (command === "bots") {
    printJson(await listBots());
    process.exit(0);
  }

  if (command === "bot") {
    const botId = rest[0];
    const flags = parseFlags(rest.slice(1));
    if (wantsHelp(subcommand) || flags.help || flags.h) {
      printBotUsage();
      process.exit(0);
    }

    switch (subcommand) {
      case "create": {
        const id = rest[0];
        if (!id) {
          console.error("Usage: codexbridge bot create <id> [--name <name>]");
          process.exit(1);
        }
        const bot = await createBot({
          id,
          name: flags.name || id,
          enabled: flags.enabled === true ? true : flags.enabled === "false" ? false : true,
        });
        printJson(bot);
        process.exit(0);
      }
      case "show":
        printJson(await inspectBot(botId));
        process.exit(0);
      case "use":
        if (!botId) {
          console.error("Usage: codexbridge bot use <id>");
          process.exit(1);
        }
        printJson(await setActiveBot(botId));
        process.exit(0);
      case "current":
        printJson(await getActiveBot());
        process.exit(0);
      case "run":
        if (!botId) {
          console.error("Usage: codexbridge bot run <id>");
          process.exit(1);
        }
        await runBotRuntime(botId);
        process.exit(0);
      case "start":
        printJson({ id: botId, pid: await startBot(botId) });
        process.exit(0);
      case "stop":
        printJson({ id: botId, stopped: await stopBot(botId) });
        process.exit(0);
      case "restart":
        printJson({ id: botId, pid: await restartBot(botId) });
        process.exit(0);
      case "enable":
        printJson(await setBotEnabled(botId, true));
        process.exit(0);
      case "disable":
        printJson(await setBotEnabled(botId, false));
        process.exit(0);
      case "delete":
        await deleteBot(botId);
        printJson({ id: botId, deleted: true });
        process.exit(0);
      case "logs":
        printJson(await readBotLogs(botId));
        process.exit(0);
      case "config": {
        if (!botId) {
          console.error("Usage: codexbridge bot config <id>");
          process.exit(1);
        }
        const bot = await getBot(botId);
        printJson(await readConfig(bot.homePath));
        process.exit(0);
      }
      case "set-config": {
        if (!botId || !flags.json) {
          console.error("Usage: codexbridge bot set-config <id> --json '<json>'");
          process.exit(1);
        }
        const patch = JSON.parse(flags.json);
        printJson(await updateBotConfig(botId, (config) => deepMergeConfig(config, patch)));
        process.exit(0);
      }
      case "health":
        printJson(await healthCheckBot(botId));
        process.exit(0);
      default:
        printBotUsage();
        process.exit(1);
    }
  }

  if (command === "rollout") {
    const flags = parseFlags(rest);
    if (subcommand === "restart-all") {
      printJson(await rollingRestartBots());
      process.exit(0);
    }
    if (subcommand === "canary") {
      const ids = String(flags.bots || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (!ids.length || !flags.version) {
        console.error("Usage: codexbridge rollout canary --bots <id1,id2> --version <version>");
        process.exit(1);
      }
      printJson(await canaryRollout(ids, String(flags.version)));
      process.exit(0);
    }
    if (subcommand === "rollback") {
      const botId = rest[0];
      if (!botId || !flags.version) {
        console.error("Usage: codexbridge rollout rollback <id> --version <version>");
        process.exit(1);
      }
      printJson(await rollbackBot(botId, String(flags.version)));
      process.exit(0);
    }
    console.error("Usage: codexbridge rollout <restart-all|canary|rollback> ...");
    process.exit(1);
  }

  await startCli({ botId: await readActiveBotId() });
}

await main().catch((error) => {
  if (isReadlineAbortError(error)) {
    process.stderr.write("\n");
    process.exit(0);
  }
  const message = error?.message || String(error);
  if (process.env.CODEXBRIDGE_DEBUG === "1") {
    console.error(error?.stack || message);
  } else {
    console.error(message);
  }
  process.exit(1);
});
