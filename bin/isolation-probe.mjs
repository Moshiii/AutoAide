#!/usr/bin/env node

import { getWorkspacePath, readConfig, resolveBotHome, writeConfig } from "../src/config.mjs";
import { isolationProbeToConfigEvidence, runIsolationProbe } from "../src/security/isolation-probe.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

function printUsage() {
  console.log([
    "Usage:",
    "  npm run isolation:probe -- [--bot-home /path/to/bot] [--mode container] [--workspace-root /path/to/workspace] [--forbidden-path /path/outside/workspace] [--record false]",
    "",
    "The probe passes only when a hard-isolation mode is declared, workspace read/write works, and the forbidden host path cannot be read or written.",
    "Hard-isolation modes: system_user, container, microvm, macos_sandbox, remote_worker.",
  ].join("\n"));
}

const options = parseArgs();
if (options.help) {
  printUsage();
  process.exit(0);
}

const botHome = options["bot-home"] || options.botHome || resolveBotHome(options.bot || options.botId);
const config = await readConfig(botHome);
const mode = options.mode || config.runtime?.isolation?.mode || "none";
const workspaceRoot = options["workspace-root"] || options.workspaceRoot || getWorkspacePath(botHome);
const result = await runIsolationProbe({
  mode,
  workspaceRoot,
  forbiddenPath: options["forbidden-path"] || options.forbiddenPath,
});

if (options.record !== "false") {
  const evidence = isolationProbeToConfigEvidence(result);
  await writeConfig({
    ...config,
    runtime: {
      ...config.runtime,
      isolation: {
        ...config.runtime.isolation,
        mode,
        verified: result.status === "pass",
        lastProbe: evidence,
      },
    },
  }, botHome);
}

console.log(JSON.stringify(result, null, 2));
if (result.status !== "pass") {
  process.exitCode = 1;
}
