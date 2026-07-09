import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

import { withTempHome } from "../helpers/module.js";

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
    assert.match(result.stdout, /default\s+Default \[current, disabled, offline, telegram\]/);
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
