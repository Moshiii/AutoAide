import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeTelegramEnvelope } from "../channels/envelope.mjs";
import { prepareChatRequest } from "../chat-request-service.mjs";
import { appendConversationLogEvent } from "../conversation-log.mjs";
import { resolveConversationIdentity } from "../session-routing.mjs";
import { runPreparedTelegramCodexTurn } from "./prepared-runner.mjs";

const DEFAULT_MAIN_SESSION_LABEL = "main";
const DEFAULT_MAIN_SESSION_DISPLAY = "personal-chief-of-staff";

export function getTelegramMessageText(message = {}) {
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }
  if (typeof message.caption === "string" && message.caption.trim()) {
    return message.caption.trim();
  }
  return "";
}

export function getTelegramMessageEntities(message = {}) {
  if (typeof message.text === "string" && message.text.trim()) {
    return Array.isArray(message.entities) ? message.entities : [];
  }
  if (typeof message.caption === "string" && message.caption.trim()) {
    return Array.isArray(message.caption_entities) ? message.caption_entities : [];
  }
  return [];
}

export function isTelegramGroupChat(message = {}) {
  const chatType = message.chat?.type;
  return chatType === "group" || chatType === "supergroup";
}

export function extractTelegramBotMention(messageText, entities, botUsername) {
  if (!messageText || !botUsername) {
    return null;
  }
  const normalizedUsername = String(botUsername).replace(/^@+/, "").toLowerCase();
  for (const entity of entities || []) {
    if (entity?.type !== "mention") {
      continue;
    }
    const mentionText = messageText.slice(entity.offset, entity.offset + entity.length);
    if (mentionText.replace(/^@+/, "").toLowerCase() === normalizedUsername) {
      return {
        offset: entity.offset,
        length: entity.length,
        text: mentionText,
      };
    }
  }
  return null;
}

export function stripTelegramBotMention(messageText, mention) {
  if (!messageText || !mention) {
    return messageText;
  }
  return `${messageText.slice(0, mention.offset)} ${messageText.slice(mention.offset + mention.length)}`
    .replace(/\s+/g, " ")
    .trim();
}

export function renderTelegramRunningMessage(_prompt, sessionLabel, mode) {
  return `Running ${mode} on [${sessionLabel}]...`;
}

export function renderTelegramRequestFailedMessage(errorText = "") {
  const detail = String(errorText || "").trim();
  return [
    "The request failed before CodexBridge could return an answer.",
    detail ? `Detail: ${detail}` : null,
    "Paid credits charged for this request are refunded automatically; daily free quota does not spend paid credits.",
    "Try again later. If this keeps happening, ask the operator to check the runtime log.",
  ].filter(Boolean).join("\n");
}

export function createDefaultTelegramRouterState() {
  return {
    version: 1,
    chats: {},
    sessions: {
      [DEFAULT_MAIN_SESSION_LABEL]: {
        label: DEFAULT_MAIN_SESSION_LABEL,
        displayLabel: DEFAULT_MAIN_SESSION_DISPLAY,
        backend: "codex",
        cliSessionRef: null,
        isMain: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export function normalizeTelegramRouterState(parsed = {}) {
  const defaults = createDefaultTelegramRouterState();
  const state = {
    version: 1,
    chats: parsed?.chats && typeof parsed.chats === "object" ? parsed.chats : {},
    sessions: parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
  };
  if (!state.sessions[DEFAULT_MAIN_SESSION_LABEL]) {
    state.sessions[DEFAULT_MAIN_SESSION_LABEL] = defaults.sessions[DEFAULT_MAIN_SESSION_LABEL];
  }
  return state;
}

export async function readTelegramRouterState(filePath) {
  try {
    return normalizeTelegramRouterState(JSON.parse(await readFile(filePath, "utf8")));
  } catch {
    return createDefaultTelegramRouterState();
  }
}

export async function writeTelegramRouterState(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalizeTelegramRouterState(state), null, 2)}\n`, "utf8");
}

export function ensureTelegramChatState(state, chatId) {
  if (!state.chats[chatId]) {
    state.chats[chatId] = {
      activeSessionLabel: DEFAULT_MAIN_SESSION_LABEL,
      updatedAt: new Date().toISOString(),
    };
  }
  return state.chats[chatId];
}

export function ensureTelegramEnvelopeSession(state, envelope) {
  const { sessionKey, sessionLabel } = resolveConversationIdentity(envelope);
  if (!state.sessions[sessionLabel]) {
    state.sessions[sessionLabel] = {
      label: sessionLabel,
      displayLabel: sessionLabel,
      backend: "codex",
      cliSessionRef: null,
      isMain: false,
      sessionKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else if (!state.sessions[sessionLabel].sessionKey) {
    state.sessions[sessionLabel].sessionKey = sessionKey;
  }
  const chatState = ensureTelegramChatState(state, envelope.chatId);
  chatState.activeSessionLabel = sessionLabel;
  chatState.updatedAt = new Date().toISOString();
  return state.sessions[sessionLabel];
}

function getRunningJobKey(chatId, sessionLabel) {
  return `${chatId}:${sessionLabel}`;
}

function getTelegramUserDisplayName(user = {}) {
  return user.username || user.first_name || user.last_name || String(user.id || "");
}

async function appendLogSafely(appendLog, payload, botHome) {
  try {
    await appendLog(payload, botHome);
  } catch {
    // Conversation logging should not break the user-visible Telegram flow.
  }
}

export async function handleTelegramTextMessageFlow({
  message,
  botHome,
  routerStatePath,
  botUsername,
  commandConfig = {},
  runningJobs = new Map(),
  sendMessage,
  deps = {},
} = {}) {
  if (typeof sendMessage !== "function") {
    throw new Error("Telegram message flow requires sendMessage.");
  }
  const text = getTelegramMessageText(message);
  const chatId = String(message?.chat?.id ?? "");
  if (!text || !chatId || message?.from?.id == null) {
    return { action: "ignored", reason: "missing_text_chat_or_user" };
  }

  const entities = getTelegramMessageEntities(message);
  const mention = isTelegramGroupChat(message)
    ? extractTelegramBotMention(text, entities, botUsername)
    : null;
  if (isTelegramGroupChat(message) && !mention) {
    return { action: "ignored", reason: "mention_required" };
  }

  const normalizedText = mention ? stripTelegramBotMention(text, mention) : text;
  if (!normalizedText) {
    return { action: "ignored", reason: "empty_text" };
  }

  const readRouterState = deps.readRouterState || readTelegramRouterState;
  const writeRouterState = deps.writeRouterState || writeTelegramRouterState;
  const prepareRequest = deps.prepareChatRequest || prepareChatRequest;
  const runPrepared = deps.runPreparedTelegramCodexTurn || runPreparedTelegramCodexTurn;
  const appendLog = deps.appendConversationLogEvent || appendConversationLogEvent;
  const state = await readRouterState(routerStatePath);
  ensureTelegramChatState(state, chatId);

  const envelope = normalizeTelegramEnvelope(message, {
    text: normalizedText,
    explicitlyMentionedBot: Boolean(mention),
  });
  const session = ensureTelegramEnvelopeSession(state, envelope);
  const activeLabel = session.label;
  const routeKey = getRunningJobKey(chatId, activeLabel);
  const mode = session.cliSessionRef ? "Codex resume" : "Codex";
  await writeRouterState(routerStatePath, state);

  const conversationId = session.sessionKey || activeLabel;
  const preparedRequest = await prepareRequest({
    channel: envelope.channel,
    externalUserId: envelope.userId,
    displayName: getTelegramUserDisplayName(message.from),
    envelope: {
      ...envelope,
      conversationId,
    },
    chatId: envelope.chatId,
    messageId: envelope.messageId,
    conversationId,
    content: normalizedText,
    botHome,
  });

  if (!preparedRequest.ok) {
    await appendLogSafely(appendLog, {
      runId: preparedRequest.run?.runId,
      userId: preparedRequest.user?.id,
      channel: envelope.channel,
      chatType: envelope.chatType,
      chatId: envelope.chatId,
      messageId: envelope.messageId,
      conversationId,
      direction: "output",
      content: preparedRequest.message,
      metadata: {
        decision: preparedRequest.decision,
        reason: preparedRequest.reason,
        policy: preparedRequest.policy,
      },
    }, botHome);
    await sendMessage({
      chatId: envelope.chatId,
      replyToMessageId: envelope.messageId,
      text: preparedRequest.message,
    });
    return { action: "denied", envelope, preparedRequest };
  }

  const run = preparedRequest.run;
  const chargeResult = preparedRequest.charged;
  await appendLogSafely(appendLog, {
    runId: run.runId,
    userId: run.userId,
    channel: envelope.channel,
    chatType: envelope.chatType,
    chatId: envelope.chatId,
    messageId: envelope.messageId,
    conversationId,
    direction: "input",
    content: normalizedText,
    metadata: {
      costSource: chargeResult?.costSource,
      creditsCharged: chargeResult?.charged,
      policy: preparedRequest.policy,
    },
  }, botHome);

  const result = await runPrepared({
    runRecord: run,
    chargeResult,
    promptText: normalizedText,
    botHome,
    session,
    routeKey,
    chatId: envelope.chatId,
    messageId: envelope.messageId,
    activeLabel,
    envelope,
    commandConfig,
    runningJobs,
    onRunning: async () => {
      await sendMessage({
        chatId: envelope.chatId,
        replyToMessageId: envelope.messageId,
        text: renderTelegramRunningMessage(normalizedText, activeLabel, mode),
      });
    },
    onSessionRef: async (cliSessionRef) => {
      session.cliSessionRef = cliSessionRef;
      session.updatedAt = new Date().toISOString();
      await writeRouterState(routerStatePath, state);
    },
  });

  const messageText = result.messageText || renderTelegramRequestFailedMessage(result.errorText);
  await sendMessage({
    chatId: envelope.chatId,
    replyToMessageId: envelope.messageId,
    text: messageText,
  });
  await appendLogSafely(appendLog, {
    runId: run.runId,
    userId: run.userId,
    channel: envelope.channel,
    chatType: envelope.chatType,
    chatId: envelope.chatId,
    messageId: envelope.messageId,
    conversationId,
    direction: "output",
    content: messageText,
    metadata: {
      ok: Boolean(result.ok),
      stopped: Boolean(result.stopped),
    },
  }, botHome);

  return {
    action: result.ok ? "completed" : "failed",
    envelope,
    preparedRequest,
    result,
  };
}
