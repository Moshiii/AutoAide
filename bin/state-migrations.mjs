#!/usr/bin/env node

import {
  getStateMigrationStatus,
  runStateMigrations,
} from "../src/state-migrations.mjs";
import { resolveBotHome } from "../src/config.mjs";

function parseArgs(argv = process.argv.slice(2)) {
  const [command = "status", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { command, options };
}

function printUsage() {
  console.log([
    "Usage:",
    "  npm run state:migrate -- status [--bot-home /path/to/bot]",
    "  npm run state:migrate -- run [--bot-home /path/to/bot] [--dry-run]",
  ].join("\n"));
}

const { command, options } = parseArgs();
const botHome = options["bot-home"] || options.botHome || resolveBotHome();

if (command === "status") {
  console.log(JSON.stringify(await getStateMigrationStatus({ botHome }), null, 2));
} else if (command === "run") {
  console.log(JSON.stringify(await runStateMigrations({
    botHome,
    dryRun: options["dry-run"] === "true" || options.dryRun === "true",
  }), null, 2));
} else {
  printUsage();
  process.exitCode = 1;
}
