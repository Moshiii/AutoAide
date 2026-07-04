import { spawn } from "node:child_process";

import { normalizeCodexCliEvent, summarizeCodexCliEvent } from "./agents/events.mjs";
import { WORKSPACE_PATH } from "./config.mjs";
import { filterEnv } from "./policy/run-policy.mjs";

const DEFAULT_START_COMMAND = "codex exec --skip-git-repo-check --json -";
const DEFAULT_RESUME_TEMPLATE = "codex exec resume --skip-git-repo-check --json __SESSION_ID__ -";
const DEFAULT_MAX_RUN_MS = 30 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_HARD_KILL_MS = 5000;

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function commandHasModel(command) {
  return /(^|\s)(-m|--model)\s/.test(command) || /(^|\s)(-c|--config)\s+model=/.test(command);
}

function applyModelToCommand(command, model) {
  if (!model || commandHasModel(command)) {
    return command;
  }
  return `${command} --model ${shellQuote(model)}`;
}

function useLoginShell() {
  const raw = process.env.CODEXBRIDGE_LOGIN_SHELL?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getShellSpec() {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c"],
    };
  }
  return {
    command: process.env.SHELL || "zsh",
    args: [useLoginShell() ? "-lc" : "-c"],
  };
}

export function buildCommandConfig(config) {
  const model = config.runtime?.model || "gpt-5.4";
  return {
    cwd: process.env.CODEX_CWD?.trim() || WORKSPACE_PATH,
    startCommand: applyModelToCommand(process.env.CODEX_START_COMMAND?.trim() || DEFAULT_START_COMMAND, model),
    resumeTemplate: applyModelToCommand(
      process.env.CODEX_RESUME_COMMAND_TEMPLATE?.trim() || DEFAULT_RESUME_TEMPLATE,
      model,
    ),
    model,
    maxRunMs: parsePositiveInteger(
      process.env.CODEXBRIDGE_MAX_RUN_MS || config.runtime?.maxRunMs,
      DEFAULT_MAX_RUN_MS,
    ),
    maxOutputBytes: parsePositiveInteger(
      process.env.CODEXBRIDGE_MAX_OUTPUT_BYTES || config.runtime?.maxOutputBytes,
      DEFAULT_MAX_OUTPUT_BYTES,
    ),
  };
}

export function applyRunPolicyToCommandConfig(commandConfig, {
  runPolicy,
  workspacePolicy,
  cwd = ".",
  env = process.env,
} = {}) {
  const next = { ...commandConfig };
  if (workspacePolicy) {
    const resolved = workspacePolicy.resolveCandidate(cwd);
    if (!resolved.ok) {
      throw new Error(`Codex cwd denied by workspace policy: ${resolved.reason}`);
    }
    next.cwd = resolved.path;
    next.workspacePolicy = workspacePolicy.toJSON?.() || null;
  }
  if (runPolicy) {
    next.env = filterEnv(env, runPolicy);
    next.runPolicy = runPolicy;
  }
  return next;
}

function parseCodexJson(stdout) {
  const events = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  let threadId = null;
  let finalText = "";

  for (const event of events) {
    if (event.type === "thread.started" && typeof event.thread_id === "string") {
      threadId = event.thread_id;
    }
    if (
      event.type === "item.completed" &&
      event.item &&
      event.item.type === "agent_message" &&
      typeof event.item.text === "string"
    ) {
      finalText = event.item.text;
    }
  }

  return { threadId, finalText };
}

function startShellCommand(prompt, command, cwd, options = {}) {
  const shellSpec = getShellSpec();
  const maxRunMs = parsePositiveInteger(options.maxRunMs, DEFAULT_MAX_RUN_MS);
  const maxOutputBytes = parsePositiveInteger(options.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES);
  const hardKillMs = parsePositiveInteger(options.hardKillMs, DEFAULT_HARD_KILL_MS);
  const child = spawn(shellSpec.command, [...shellSpec.args, command], {
    cwd,
    env: options.env || process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let stdoutBuffer = "";
  let outputBytes = 0;
  let settled = false;
  let timedOut = false;
  let outputLimitExceeded = false;
  let hardKillTimer = null;
  const seenStatuses = new Set();

  const terminateChild = (reason) => {
    if (child.exitCode != null) {
      return;
    }
    if (reason === "timeout") {
      timedOut = true;
    }
    if (reason === "output_limit") {
      outputLimitExceeded = true;
    }
    child.kill("SIGTERM");
    hardKillTimer = setTimeout(() => {
      if (child.exitCode == null) {
        child.kill("SIGKILL");
      }
    }, hardKillMs);
  };

  const runTimer = setTimeout(() => {
    terminateChild("timeout");
  }, maxRunMs);

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    outputBytes += Buffer.byteLength(chunk, "utf8");
    stdout += chunk;
    stdoutBuffer += chunk;
    if (outputBytes > maxOutputBytes) {
      stdout = stdout.slice(0, maxOutputBytes);
      stderr = [stderr, `Codex output exceeded maxOutputBytes (${maxOutputBytes}).`].filter(Boolean).join("\n");
      terminateChild("output_limit");
      return;
    }

    while (true) {
      const newlineIndex = stdoutBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }

      try {
        const event = JSON.parse(line);
        const agentEvent = normalizeCodexCliEvent(event, options.agentEventContext);
        if (agentEvent) {
          options.onAgentEvent?.(agentEvent, event);
        }
        const summary = summarizeCodexCliEvent(event);
        if (summary && !seenStatuses.has(summary)) {
          seenStatuses.add(summary);
          options.onStatus?.(summary, event);
        }
      } catch {
        // ignore non-JSON lines in streaming status mode
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    outputBytes += Buffer.byteLength(chunk, "utf8");
    stderr += chunk;
    if (outputBytes > maxOutputBytes) {
      stderr = stderr.slice(0, maxOutputBytes);
      stderr = [stderr, `Codex output exceeded maxOutputBytes (${maxOutputBytes}).`].filter(Boolean).join("\n");
      terminateChild("output_limit");
    }
  });

  const result = new Promise((resolve) => {
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(runTimer);
      if (hardKillTimer) {
        clearTimeout(hardKillTimer);
      }
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout: "",
        stderr: `Failed to start command: ${error.message}`,
      });
    });

    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(runTimer);
      if (hardKillTimer) {
        clearTimeout(hardKillTimer);
      }
      const errorLines = [
        stderr.trim(),
        timedOut ? `Codex run timed out after ${maxRunMs}ms.` : "",
        outputLimitExceeded ? `Codex output exceeded maxOutputBytes (${maxOutputBytes}).` : "",
      ].filter(Boolean);
      resolve({
        ok: code === 0 && !timedOut && !outputLimitExceeded,
        exitCode: code,
        signal: signal ?? null,
        stdout: stdout.trim(),
        stderr: errorLines.join("\n"),
        timedOut,
        outputLimitExceeded,
      });
    });
  });

  child.stdin.end(prompt);
  return { child, result };
}

function finalizeCliTurnResult(result, sessionRef) {
  const parsed = parseCodexJson(result.stdout);
  return {
    ...result,
    cliSessionRef: sessionRef || parsed.threadId,
    output: parsed.finalText || result.stdout,
  };
}

export async function runCliTurn(prompt, sessionRef, commandConfig) {
  const started = startCliTurn(prompt, sessionRef, commandConfig);
  const result = await started.result;
  return finalizeCliTurnResult(result, sessionRef);
}

export function startCliTurn(prompt, sessionRef, commandConfig) {
  const command = sessionRef
    ? commandConfig.resumeTemplate.replaceAll("__SESSION_ID__", sessionRef)
    : commandConfig.startCommand;
  const started = startShellCommand(prompt, command, commandConfig.cwd, {
    env: commandConfig.env,
    onStatus: commandConfig.onStatus,
    onAgentEvent: commandConfig.onAgentEvent,
    agentEventContext: commandConfig.agentEventContext,
    maxRunMs: commandConfig.maxRunMs,
    maxOutputBytes: commandConfig.maxOutputBytes,
    hardKillMs: commandConfig.hardKillMs,
  });
  return {
    child: started.child,
    result: started.result.then((result) => finalizeCliTurnResult(result, sessionRef)),
  };
}
