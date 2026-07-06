import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

import { withTempHome } from "../helpers/module.js";

function runCodexBridge(args = [], { env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "bin", "codexbridge.mjs"), ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
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
