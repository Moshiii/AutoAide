import { canUseGoal, canUseSchedule } from "../capability-policy.mjs";
import { getUserCredits } from "../user-credits.mjs";
import { buildUserId } from "../users-state.mjs";

export function parseSlashCommand(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/(?:^|\s)(\/[^\s]+)/);
  return match?.[1] ? String(match[1]).trim().toLowerCase() : null;
}

function requestActiveRunStop(child) {
  if (!child || child.exitCode != null || child.killed) {
    return false;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    return false;
  }
  setTimeout(() => {
    if (child.exitCode == null && !child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore hard-kill failures
      }
    }
  }, 3000).unref?.();
  return true;
}

export async function handleFeishuSlashCommand({
  command,
  chatState,
  client,
  chatId,
  activeRuns,
  routeKey,
  botConfig,
  envelope,
  options = {},
  deps = {},
} = {}) {
  const sendText = deps.sendText;
  if (typeof sendText !== "function") {
    throw new Error("Feishu command router requires deps.sendText.");
  }

  const renderWelcomeMessage = deps.renderWelcomeMessage;
  const renderHelpMessage = deps.renderHelpMessage;
  const renderUnsupportedCommandMessage = deps.renderUnsupportedCommandMessage;
  const renderCreditsStatus = deps.renderCreditsStatus;
  const getCredits = deps.getUserCredits || getUserCredits;
  const stopActiveRun = deps.requestActiveRunStop || requestActiveRunStop;

  if (command === "/start") {
    await sendText(client, chatId, renderWelcomeMessage(), options);
    return true;
  }

  if (command === "/where") {
    const sessionRef = chatState.cliSessionRef ? `resume=${chatState.cliSessionRef}` : "resume=not-started";
    await sendText(client, chatId, `Current session: ${chatState.sessionLabel}\n${sessionRef}`, options);
    return true;
  }

  if (command === "/credits") {
    const userId = options.user?.id || buildUserId("feishu", envelope.userId);
    const creditsInfo = await getCredits(userId, options.botHome);
    await sendText(client, chatId, renderCreditsStatus(creditsInfo, options.user || null), options);
    return true;
  }

  if (command === "/help") {
    await sendText(client, chatId, renderHelpMessage(), options);
    return true;
  }

  if (command === "/stop") {
    const stopped = stopActiveRun(activeRuns?.get(routeKey));
    await sendText(
      client,
      chatId,
      stopped
        ? `Stop requested for [${chatState.sessionLabel}].`
        : `No running task for [${chatState.sessionLabel}].`,
      options,
    );
    return true;
  }

  if (command === "/goal") {
    await sendText(
      client,
      chatId,
      canUseGoal(envelope, botConfig || {})
        ? "Feishu no longer manages goals directly. Use the local CLI or web control plane."
        : "Only the bot owner or admins can use /goal in group chats.",
      options,
    );
    return true;
  }

  if (command === "/schedule" || command === "/schedules" || command === "/schedule-stop" || command === "/schedule-run") {
    await sendText(
      client,
      chatId,
      canUseSchedule(envelope, botConfig || {})
        ? "Feishu no longer manages schedules directly. Use the local CLI or web control plane."
        : "Only the bot owner or admins can use /schedule in group chats.",
      options,
    );
    return true;
  }

  if (String(command || "").startsWith("/")) {
    await sendText(client, chatId, renderUnsupportedCommandMessage(command), options);
    return true;
  }

  return false;
}
