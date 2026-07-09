import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

import { importFresh, withTempHome } from "../helpers/module.js";

function runCodexBridge(args = [], { env = {}, stdin = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "bin", "codexbridge.mjs"), ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
    if (Array.isArray(stdin)) {
      let delay = 0;
      for (const chunk of stdin) {
        setTimeout(() => child.stdin.write(chunk), delay);
        delay += 500;
      }
      setTimeout(() => child.stdin.end(), delay);
    } else if (stdin == null) {
      child.stdin.end();
    } else {
      child.stdin.end(stdin);
    }
  });
}

function parseJsonOutput(result) {
  return JSON.parse(result.stdout);
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "");
}

test("codexbridge web --help prints usage without starting the web runtime", async () => {
  await withTempHome(async (tempHome) => {
    const result = await runCodexBridge(["web", "--help"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /codexbridge web status/);
    assert.doesNotMatch(result.stdout, /control plane web running/);
    assert.equal(result.stderr, "");
  });
});

test("codexbridge bot start prints a clean user-facing error", async () => {
  await withTempHome(async (tempHome) => {
    const result = await runCodexBridge(["bot", "start", "default"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /Telegram is not configured/);
    assert.doesNotMatch(result.stderr, /at async main/);
  });
});

test("codexbridge does not print the startup logo outside an interactive TTY", async () => {
  await withTempHome(async (tempHome) => {
    const result = await runCodexBridge(["--help"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });

    assert.equal(result.code, 0);
    assert.doesNotMatch(result.stdout, /░██████/);
    assert.doesNotMatch(result.stdout, /personal AI shell/);
    assert.equal(result.stderr, "");
  });
});

test("codexbridge management CLI sends plain text to TUI guidance", async () => {
  await withTempHome(async (tempHome) => {
    const result = await runCodexBridge([], {
      env: { CODEXBRIDGE_HOME: tempHome },
      stdin: "hello\n",
    });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Chat Moved to TUI/);
    assert.match(result.stdout, /codexbridge tui/);
    assert.doesNotMatch(result.stdout, /Running on/);
    assert.equal(result.stderr, "");
  });
});

test("codexbridge bot picker only lists bots and new bot", async () => {
  await withTempHome(async (tempHome) => {
    const result = await runCodexBridge([], {
      env: { CODEXBRIDGE_HOME: tempHome },
      stdin: "/bots\nq\n/exit\n",
    });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Bots/);
    assert.match(result.stdout, /Default \(default\)\s+\[current, disabled, offline, telegram\]/);
    assert.match(result.stdout, /new bot/);
    assert.doesNotMatch(result.stdout, /rename/);
    assert.doesNotMatch(result.stdout, /enable\/disable/);
    assert.equal(result.stderr, "");
  });
});

test("codexbridge menu reports runtime start failures", async () => {
  await withTempHome(async (tempHome) => {
    const result = await runCodexBridge([], {
      env: { CODEXBRIDGE_HOME: tempHome },
      stdin: ["/menu\n", "2\n", "/exit\n"],
    });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Runtime Start Failed/);
    assert.match(result.stdout, /Telegram is not configured/);
    assert.equal(result.stderr, "");
  });
});

test("codexbridge user management menu selects a current-bot user before actions", async () => {
  await withTempHome(async (tempHome) => {
    const { ensureDefaultBot } = await importFresh("../../src/bots.mjs");
    const { resolveBotHome } = await importFresh("../../src/config.mjs");
    const { upsertUser } = await importFresh("../../src/users-state.mjs");

    await ensureDefaultBot();
    const botHome = resolveBotHome("default");
    await upsertUser({
      channel: "feishu",
      externalUserId: "ou_menu_user",
      displayName: "Menu Alice",
    }, botHome);

    const result = await runCodexBridge([], {
      env: { CODEXBRIDGE_HOME: tempHome },
      stdin: ["/menu\n", "7\n", "1\n", "1\n", "5\n", "q\n", "/exit\n"],
    });

    assert.equal(result.code, 0);
    const stdout = stripAnsi(result.stdout);
    assert.match(stdout, /Users · Default \(default\)/);
    assert.match(stdout, /Menu Alice \(feishu:ou_menu_user\)/);
    assert.match(stdout, /Add credits/);
    assert.match(stdout, /Adjust dailyFreeLimit/);
    assert.match(stdout, /Credits Added/);
    assert.match(stdout, /balance after:\s+5/);
    assert.equal(result.stderr, "");
  });
});

test("codexbridge users CLI manages credits, private access, and bans", async () => {
  await withTempHome(async (tempHome) => {
    const { ensureDefaultBot } = await importFresh("../../src/bots.mjs");
    const { resolveBotHome } = await importFresh("../../src/config.mjs");
    const { upsertUser } = await importFresh("../../src/users-state.mjs");

    await ensureDefaultBot();
    const botHome = resolveBotHome("default");
    await upsertUser({
      channel: "feishu",
      externalUserId: "ou_cli_user",
      displayName: "Alice",
    }, botHome);

    const list = await runCodexBridge(["users", "list"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });
    assert.equal(list.code, 0);
    assert.equal(parseJsonOutput(list)[0].id, "feishu:ou_cli_user");

    const grant = await runCodexBridge(["users", "grant", "feishu:ou_cli_user", "7"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });
    assert.equal(grant.code, 0);
    assert.equal(parseJsonOutput(grant).credits.balanceAfter, 7);

    const unlock = await runCodexBridge(["users", "unlock", "feishu:ou_cli_user"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });
    assert.equal(unlock.code, 0);
    assert.equal(parseJsonOutput(unlock).privateEnabled, true);

    const ban = await runCodexBridge(["users", "ban", "feishu:ou_cli_user"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });
    assert.equal(ban.code, 0);
    assert.equal(parseJsonOutput(ban).status, "banned");

    const usage = await runCodexBridge(["users", "usage", "feishu:ou_cli_user"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });
    assert.equal(usage.code, 0);
    assert.equal(parseJsonOutput(usage).some((event) => event.eventType === "grant"), true);

    const audit = await runCodexBridge(["users", "audit", "feishu:ou_cli_user"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });
    assert.equal(audit.code, 0);
    assert.equal(parseJsonOutput(audit).some((event) => event.action === "set_user_status"), true);
  });
});

test("codexbridge users CLI rejects unknown users and has no delete command", async () => {
  await withTempHome(async (tempHome) => {
    const grant = await runCodexBridge(["users", "grant", "feishu:missing", "1"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });
    assert.equal(grant.code, 1);
    assert.match(grant.stderr, /Unknown user/);

    const help = await runCodexBridge(["users", "--help"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });
    assert.equal(help.code, 0);
    assert.match(help.stdout, /There is no delete command/);
    assert.doesNotMatch(help.stdout, /users delete/);
  });
});

test("codexbridge users status rejects invalid statuses", async () => {
  await withTempHome(async (tempHome) => {
    const result = await runCodexBridge(["users", "status", "feishu:missing", "vip"], {
      env: { CODEXBRIDGE_HOME: tempHome },
    });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /Status must be one of/);
  });
});
