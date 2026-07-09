import { getBot, setActiveBot } from "./bots.mjs";
import { getWorkspacePath, readCliState, readConfig, writeCliState } from "./config.mjs";
import { buildCommandConfig, startCliTurn } from "./codex-runner.mjs";
import { appendConversationLogEvent } from "./conversation-log.mjs";
import { buildWorkspacePrompt } from "./workspace-context.mjs";
import { ensureWorkspaceBootstrap } from "./workspace-bootstrap.mjs";

function nowIso() {
  return new Date().toISOString();
}

function normalizeTurnError(result = {}) {
  return [result.output, result.stderr].filter(Boolean).join("\n\n") || "Codex turn failed.";
}

export async function runTuiTurn(botId, prompt, { sessionLabel = null } = {}) {
  const nextPrompt = String(prompt || "").trim();
  if (!nextPrompt) {
    throw new Error("Prompt is required.");
  }

  const bot = await getBot(botId);
  await setActiveBot(bot.id);
  await ensureWorkspaceBootstrap(bot.homePath);

  const config = await readConfig(bot.homePath);
  const cliState = await readCliState(bot.homePath);
  const label = sessionLabel || cliState.activeSessionLabel || "main";
  const timestamp = nowIso();
  if (!cliState.sessions[label]) {
    cliState.sessions[label] = {
      label,
      cliSessionRef: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
  cliState.activeSessionLabel = label;
  await writeCliState(cliState, bot.homePath);

  const session = cliState.sessions[label];
  const statuses = [];
  const commandConfig = {
    ...buildCommandConfig(config),
    cwd: getWorkspacePath(bot.homePath),
    onStatus(status) {
      statuses.push(status);
    },
  };
  const workspacePrompt = await buildWorkspacePrompt(nextPrompt, { botHome: bot.homePath });

  await appendConversationLogEvent({
    userId: "local-tui",
    channel: "tui",
    chatType: "direct",
    chatId: bot.id,
    conversationId: label,
    direction: "input",
    content: nextPrompt,
    metadata: {
      sessionLabel: label,
      resumed: Boolean(session.cliSessionRef),
    },
  }, bot.homePath).catch(() => {});

  const started = startCliTurn(workspacePrompt, session.cliSessionRef, commandConfig);
  const result = await started.result;
  const latestState = await readCliState(bot.homePath);
  latestState.sessions[label] = {
    ...(latestState.sessions[label] ?? session),
    label,
    cliSessionRef: result.cliSessionRef || latestState.sessions[label]?.cliSessionRef || null,
    createdAt: latestState.sessions[label]?.createdAt || session.createdAt || timestamp,
    updatedAt: nowIso(),
  };
  latestState.activeSessionLabel = label;
  await writeCliState(latestState, bot.homePath);

  const output = result.ok ? result.output || "Done." : "";
  const error = result.ok ? null : normalizeTurnError(result);
  await appendConversationLogEvent({
    userId: "local-tui",
    channel: "tui",
    chatType: "direct",
    chatId: bot.id,
    conversationId: label,
    direction: "output",
    content: result.ok ? output : error,
    metadata: {
      sessionLabel: label,
      ok: result.ok,
      resumed: Boolean(session.cliSessionRef),
      cliSessionRef: latestState.sessions[label].cliSessionRef,
    },
  }, bot.homePath).catch(() => {});

  return {
    ok: result.ok,
    botId: bot.id,
    sessionLabel: label,
    cliSessionRef: latestState.sessions[label].cliSessionRef,
    resumed: Boolean(session.cliSessionRef),
    output,
    error,
    statuses,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: Boolean(result.timedOut),
    outputLimitExceeded: Boolean(result.outputLimitExceeded),
  };
}
