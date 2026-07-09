import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyRunPolicyToCommandConfig, buildCommandConfig } from "../../src/codex-runner.mjs";
import { loadFeishuSdk } from "../../src/feishu/sdk-loader.mjs";
import {
  getChannelStatePath,
  getFeishuBridgePidPath,
  getWorkspacePath,
  readConfig,
  resolveBotHome,
  writeConfig,
} from "../../src/config.mjs";
import { buildWorkspacePrompt } from "../../src/workspace-context.mjs";
import { normalizeFeishuEnvelope } from "../../src/channel-envelope.mjs";
import { isMigrationFeatureEnabled } from "../../src/runtime/feature-flags.mjs";
import { QuestionBroker } from "../../src/runtime/question-broker.mjs";
import { createDefaultRunPolicy } from "../../src/policy/run-policy.mjs";
import { createDefaultWorkspacePolicy } from "../../src/policy/workspace-policy.mjs";
import { PermissionBroker } from "../../src/permissions/permission-broker.mjs";
import { FeishuPermissionBroker } from "../../src/permissions/feishu-permission-broker.mjs";
import { PersistentCallbackNonceStore } from "../../src/security/callback-nonce-store.mjs";
import { routeFeishuCardAction } from "../../src/feishu/callback-router.mjs";
import { startFeishuCallbackServer } from "../../src/feishu/callback-server.mjs";
import { runPreparedFeishuCodexTurn } from "../../src/feishu/prepared-runner.mjs";
import { FeishuQuestionBroker } from "../../src/feishu/question-broker.mjs";
import { FEISHU_TYPING_REACTION, addFeishuReaction, normalizeFeishuText, sendFeishuCard, sendFeishuText, updateFeishuCard } from "../../src/feishu/client.mjs";
import { handleFeishuSlashCommand, parseSlashCommand as parseFeishuSlashCommand } from "../../src/feishu/command-router.mjs";
import { FeishuCardUpdateController } from "../../src/feishu/card-updater.mjs";
import { FEISHU_CARD_STATE } from "../../src/feishu/cards.mjs";
import {
  classifyFeishuMessageEvent,
} from "../../src/feishu/event-gateway.mjs";
import {
  createFeishuEventDispatcher,
  createFeishuGatewayClients,
} from "../../src/feishu/gateway.mjs";
import {
  ensureFeishuCliSession,
  ensureFeishuConversationState,
  readFeishuRouterState,
  writeFeishuRouterState,
} from "../../src/feishu/router-state.mjs";
import { getUserCredits } from "../../src/user-credits.mjs";
import {
  createQueuedRun,
  markRunDenied,
} from "../../src/run-service.mjs";
import { chargePreparedChatRequest, prepareChatRequest } from "../../src/chat-request-service.mjs";
import { appendConversationLogEvent } from "../../src/conversation-log.mjs";
import { writeLogEvent } from "../../src/structured-logger.mjs";
import {
  buildUserId,
  canUseGroupChat,
  canUsePrivateChat,
  renderPrivateChatLockedMessage,
  upsertUser,
} from "../../src/users-state.mjs";

const DEFAULT_BOT_HOME = resolveBotHome();
const DEFAULT_PID_PATH = getFeishuBridgePidPath(DEFAULT_BOT_HOME);
const ROUTER_STATE_PATH = path.join(getChannelStatePath("feishu", DEFAULT_BOT_HOME), "router.json");
const CALLBACK_NONCE_PATH = path.join(getChannelStatePath("feishu", DEFAULT_BOT_HOME), "callback-nonces.json");
const __filename = fileURLToPath(import.meta.url);

function nowIso() {
  return new Date().toISOString();
}

async function readPidFile(filePath) {
  try {
    const raw = (await readFile(filePath, "utf8")).trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function writePidFile(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    const handle = await open(filePath, "wx");
    await handle.writeFile(`${process.pid}\n`, "utf8");
    await handle.close();
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }

    const existingPid = await readPidFile(filePath);
    if (existingPid) {
      try {
        process.kill(existingPid, 0);
        throw new Error(`Feishu bridge already running with pid ${existingPid}`);
      } catch (pidError) {
        if (pidError?.code !== "ESRCH") {
          throw pidError;
        }
      }
    }

    await clearPidFile(filePath);
    const retryHandle = await open(filePath, "wx");
    await retryHandle.writeFile(`${process.pid}\n`, "utf8");
    await retryHandle.close();
  }
}

async function clearPidFile(filePath) {
  try {
    const currentPid = (await readFile(filePath, "utf8")).trim();
    if (currentPid === String(process.pid)) {
      await unlink(filePath);
    }
  } catch {
    // ignore cleanup failures
  }
}

export function renderWelcomeMessage() {
  return [
    "CodexBridge is ready.",
    "In a group, mention CodexBridge or the app name and ask a normal question to try the daily free quota.",
    "Example: CodexBridge summarize this repo in 3 bullets.",
    "Everyone in the group can see the conversation, so avoid private or sensitive content there.",
    "Use /credits to check your daily free usage, paid credits, and private chat access.",
    "Private chat unlocks after paid credits are added or an operator enables it.",
  ].join("\n");
}

export function renderHelpMessage() {
  return [
    renderWelcomeMessage(),
    "",
    "Commands:",
    "/start - show the quick start",
    "/credits - check quota and private access",
    "/where - show the current session",
    "/stop - stop the running request",
    "",
    "Operators manage credits, bans, and access in the local web control plane.",
  ].join("\n");
}

export function renderUnsupportedPayloadMessage() {
  return [
    "I can handle plain text messages here right now.",
    "For document work, send a text request or a Feishu doc link first.",
    "File attachment download/upload and generated Feishu document delivery must be enabled by the operator before attachments can be processed directly.",
  ].join("\n");
}

export function renderUnsupportedCommandMessage(command) {
  return [
    `I do not recognize ${command}.`,
    "Use /help to see the available chat commands.",
    "Operators can manage credits, bans, and access in the local web control plane.",
  ].join("\n");
}

export function renderBusyMessage(sessionLabel) {
  return [
    `A request is already running on [${sessionLabel}].`,
    "Please wait for it to finish, or use /stop if you want to cancel it before sending another request.",
  ].join("\n");
}

export function renderRequestFailedMessage(errorText = "") {
  const detail = String(errorText || "").trim();
  return [
    "The request failed before CodexBridge could return an answer.",
    detail ? `Detail: ${detail}` : null,
    "Paid credits charged for this request are refunded automatically; daily free quota does not spend paid credits.",
    "Try again later. If this keeps happening, ask the operator to check the runtime log.",
  ].filter(Boolean).join("\n");
}

async function readRouterState(filePath) {
  return await readFeishuRouterState(filePath);
}

async function writeRouterState(filePath, state) {
  await writeFeishuRouterState(filePath, state);
}

function ensureConversationState(state, envelope) {
  return ensureFeishuConversationState(state, envelope);
}

async function captureFeishuMetadata(botHome, event) {
  const chatId = event.message?.chat_id;
  const senderOpenId = event.sender?.sender_id?.open_id ?? null;
  if (!chatId) {
    return;
  }

  const config = await readConfig(botHome);
  const feishu = config.channels?.feishu ?? {};
  const chats = feishu.metadata?.chats ?? {};
  const users = feishu.metadata?.users ?? {};
  const currentChat = chats[chatId] ?? {};
  const currentUser = senderOpenId ? users[senderOpenId] ?? {} : null;
  const nextChat = {
    chatType: event.message?.chat_type ?? null,
    lastMessageType: event.message?.message_type ?? null,
    label: chatId,
  };
  const nextUser = senderOpenId
    ? {
        senderType: event.sender?.sender_type ?? null,
        label: senderOpenId,
      }
    : null;
  const chatChanged =
    currentChat.chatType !== nextChat.chatType ||
    currentChat.lastMessageType !== nextChat.lastMessageType ||
    currentChat.label !== nextChat.label;
  const userChanged =
    senderOpenId &&
    (currentUser.senderType !== nextUser.senderType || currentUser.label !== nextUser.label);

  if (!chatChanged && !userChanged) {
    return;
  }

  await writeConfig({
    ...config,
    channels: {
      ...config.channels,
      feishu: {
        ...feishu,
        metadata: {
          chats: {
            ...chats,
            [chatId]: {
              ...currentChat,
              ...nextChat,
            },
          },
          users: senderOpenId
            ? {
                ...users,
                [senderOpenId]: {
                  ...currentUser,
                  ...nextUser,
                },
              }
            : users,
        },
      },
    },
  }, botHome);
}

function normalizeMentionName(value) {
  return String(value || "").trim().toLowerCase();
}

function isBotMention(mention, botIdentity) {
  if (!mention) {
    return false;
  }
  if (botIdentity.openId && mention.id?.open_id === botIdentity.openId) {
    return true;
  }
  const mentionName = normalizeMentionName(mention.name);
  return Boolean(mentionName) && botIdentity.mentionNames.has(mentionName);
}

async function resolveBotIdentity(client, appId, config) {
  const configuredNames = Array.isArray(config.channels?.feishu?.botMentionNames)
    ? config.channels.feishu.botMentionNames
    : [];
  const names = new Set(
    [config.name, ...configuredNames].map(normalizeMentionName).filter(Boolean),
  );

  try {
    const response = await client.application.v6.application.get({
      params: {
        lang: "zh_cn",
      },
      path: {
        app_id: appId,
      },
    });
    const app = response?.data?.app;
    if (app?.app_name) {
      names.add(normalizeMentionName(app.app_name));
    }
    if (Array.isArray(app?.i18n)) {
      for (const item of app.i18n) {
        if (item?.name) {
          names.add(normalizeMentionName(item.name));
        }
      }
    }
  } catch (error) {
    console.warn("failed to resolve feishu app identity", error?.message || error);
  }

  return {
    openId: null,
    mentionNames: names,
  };
}

function rememberBotOpenId(botIdentity, response) {
  const sender = response?.data?.sender;
  if (!sender?.id || sender.id_type !== "open_id") {
    return;
  }
  botIdentity.openId = sender.id;
}

function stripMentionMarkup(text) {
  return String(text || "")
    .replace(/<at\b[^>]*>.*?<\/at>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingBotMentionText(text, event, botIdentity) {
  let normalized = String(text || "").trim();
  if (!normalized) {
    return "";
  }

  const candidateNames = new Set();
  for (const mention of event?.message?.mentions || []) {
    if (isBotMention(mention, botIdentity) && mention?.name) {
      candidateNames.add(String(mention.name).trim());
    }
  }
  for (const name of botIdentity?.mentionNames || []) {
    if (name) {
      candidateNames.add(String(name).trim());
    }
  }

  for (const rawName of candidateNames) {
    const name = String(rawName || "").trim();
    if (!name) {
      continue;
    }
    const patterns = [
      new RegExp(`^@${escapeRegExp(name)}(?:[\\s:：,，-]+|\\s*$)`, "i"),
      new RegExp(`^${escapeRegExp(name)}(?:[\\s:：,，-]+|\\s*$)`, "i"),
    ];
    let changed = true;
    while (changed) {
      changed = false;
      for (const pattern of patterns) {
        if (pattern.test(normalized)) {
          normalized = normalized.replace(pattern, "").trim();
          changed = true;
        }
      }
    }
  }

  return normalized;
}

function normalizeIncomingText(text, event, botIdentity) {
  const withoutMarkup = stripMentionMarkup(text);
  return stripLeadingBotMentionText(withoutMarkup, event, botIdentity);
}

function parseSlashCommand(text) {
  return parseFeishuSlashCommand(text);
}

function buildFeishuPrompt(text, event) {
  const cleaned = String(text || "").trim();
  if (!cleaned) {
    return "";
  }

  if (event.message?.chat_type === "p2p") {
    return cleaned;
  }

  const senderOpenId = event.sender?.sender_id?.open_id || "unknown";
  return [
    "This is a Feishu group chat message that explicitly @mentioned you.",
    `Sender open_id: ${senderOpenId}`,
    "Respond naturally to the sender's actual request in the shared conversation.",
    "Do not rewrite the user's message as a template or suggest what others should say unless the user explicitly asks for copywriting help.",
    "",
    `User request: ${cleaned}`,
  ].join("\n");
}

function getFeishuUserDisplayName(event) {
  const sender = event?.sender || {};
  return (
    sender.sender_id?.union_id ||
    sender.sender_id?.open_id ||
    sender.sender_id?.user_id ||
    ""
  );
}

async function upsertFeishuUserFromEvent(event, botHome) {
  const externalUserId = event?.sender?.sender_id?.open_id == null ? "" : String(event.sender.sender_id.open_id);
  if (!externalUserId) {
    return null;
  }
  return await upsertUser({
    id: buildUserId("feishu", externalUserId),
    channel: "feishu",
    externalUserId,
    displayName: getFeishuUserDisplayName(event),
  }, botHome);
}

export function renderCreditsStatus(creditsInfo, user = null) {
  const account = creditsInfo.account;
  const privateUnlocked = user ? canUsePrivateChat(user) : false;
  const dailyFreeRemaining = Math.max(0, Number(account.dailyFreeLimit || 0) - Number(account.dailyFreeUsed || 0));
  return [
    "CodexBridge credits",
    `User: ${account.userId}`,
    ...(user ? [
      `Plan: ${user.status}`,
      `Private chat: ${privateUnlocked ? "unlocked" : "locked - use the group for daily free access"}`,
    ] : []),
    `Daily free used: ${account.dailyFreeUsed}/${account.dailyFreeLimit}`,
    `Daily free remaining: ${dailyFreeRemaining}`,
    `Paid credits: ${account.paidCredits}`,
    `Cost: ${creditsInfo.defaults.turnCost} credit per request`,
    `Total consumed: ${account.totalConsumed}`,
    privateUnlocked
      ? "Next: send a direct message to this bot for private work. Group chat is still public; private chat uses paid credits."
      : dailyFreeRemaining > 0
        ? "Next: ask in the group to use your remaining daily free quota; top up paid credits to unlock private chat."
        : "Next: top up paid credits to continue now, or wait for the next daily free reset in group chat.",
  ].join("\n");
}

export function canFeishuUserAccessChat(user, envelope) {
  if (envelope.isDirect || envelope.chatType === "direct") {
    return canUsePrivateChat(user);
  }
  return canUseGroupChat(user);
}

function normalizeFeishuOutput(text) {
  return normalizeFeishuText(text);
}

export function renderQueuedMessage(sessionLabel, position) {
  return [
    `Queued on [${sessionLabel}] at position ${position}.`,
    "No credits have been charged yet. Billing happens when this request starts.",
  ].join("\n");
}

async function sendText(client, chatId, text, options = {}) {
  return await sendFeishuText(client, chatId, text, options);
}

async function addReaction(client, messageId, emojiType = FEISHU_TYPING_REACTION) {
  return await addFeishuReaction(client, messageId, emojiType);
}

function createRunCardController(client, chatId, messageId, botIdentity) {
  return new FeishuCardUpdateController({
    chatId,
    replyToMessageId: messageId,
    sendCard: async ({ chatId: targetChatId, replyToMessageId, card }) => {
      return await sendFeishuCard(client, targetChatId, card, { replyToMessageId });
    },
    updateCard: async ({ messageId: targetMessageId, card }) => {
      return await updateFeishuCard(client, targetMessageId, card);
    },
    sendText: async ({ chatId: targetChatId, replyToMessageId, text }) => {
      const response = await sendText(client, targetChatId, text, { replyToMessageId });
      rememberBotOpenId(botIdentity, response);
      return response;
    },
    onResponse: (response) => rememberBotOpenId(botIdentity, response),
    onError: (error) => {
      console.error("feishu card update failed", error);
    },
  });
}

function resolveFeishuCallbackConfig(feishu = {}, env = process.env) {
  const callback = feishu.callback && typeof feishu.callback === "object" ? feishu.callback : {};
  const envPort = env.FEISHU_CALLBACK_PORT || env.CODEXBRIDGE_FEISHU_CALLBACK_PORT;
  const port = callback.port ?? (envPort ? Number(envPort) : null);
  return {
    enabled: Boolean(callback.enabled || envPort),
    host: callback.host || env.FEISHU_CALLBACK_HOST || "127.0.0.1",
    port,
    path: callback.path || env.FEISHU_CALLBACK_PATH || "/webhook/card",
    signingSecret: callback.signingSecret || feishu.appSecret,
  };
}

export function resolveFeishuPolicyRole({ user = null, usageUserId = "", config = {} } = {}) {
  if (user?.status === "admin") {
    return "owner";
  }
  const ownerUserId = String(config.ownerUserId || "").trim();
  const adminUserIds = Array.isArray(config.adminUserIds)
    ? config.adminUserIds.map((id) => String(id || "").trim())
    : [];
  if (ownerUserId && ownerUserId === usageUserId) {
    return "owner";
  }
  if (adminUserIds.includes(usageUserId)) {
    return "owner";
  }
  return "user";
}

export function buildFeishuRunCommandConfig({
  baseCommandConfig,
  botHome,
  envelope = {},
  user = null,
  usageUserId = "",
  config = {},
  enabled = false,
  env = process.env,
} = {}) {
  if (!enabled) {
    return baseCommandConfig;
  }
  const role = resolveFeishuPolicyRole({ user, usageUserId, config });
  const workspacePolicy = createDefaultWorkspacePolicy({
    workspaceRoot: getWorkspacePath(botHome),
    role,
  });
  const runPolicy = createDefaultRunPolicy({
    role,
    chatType: envelope.chatType,
  });
  return applyRunPolicyToCommandConfig(baseCommandConfig, {
    workspacePolicy,
    runPolicy,
    cwd: ".",
    env,
  });
}

async function ensureSession(botHome, chatState) {
  return await ensureFeishuCliSession(botHome, chatState);
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

async function handleSlashCommand(command, chatState, client, chatId, activeRuns, routeKey, botConfig, envelope, options = {}) {
  return await handleFeishuSlashCommand({
    command,
    chatState,
    client,
    chatId,
    activeRuns,
    routeKey,
    botConfig,
    envelope,
    options: {
      ...options,
      botHome: options.botHome || DEFAULT_BOT_HOME,
    },
    deps: {
      sendText,
      renderWelcomeMessage,
      renderHelpMessage,
      renderUnsupportedCommandMessage,
      renderCreditsStatus,
      getUserCredits,
      requestActiveRunStop,
    },
  });
}

async function main() {
  const botHome = resolveBotHome();
  const config = await readConfig(botHome);
  const feishu = config.channels?.feishu ?? {};
  if (!feishu.appId || !feishu.appSecret) {
    throw new Error("Feishu bridge cannot start: bot-scoped appId/appSecret is missing.");
  }
  const Lark = await loadFeishuSdk();
  const requireExplicitMention = feishu.requireExplicitMention ?? true;

  await writePidFile(DEFAULT_PID_PATH);

  const { client, wsClient } = createFeishuGatewayClients({
    Lark,
    appId: feishu.appId,
    appSecret: feishu.appSecret,
  });

  const activeRuns = new Map();
  const chatQueues = new Map();
  const pendingCounts = new Map();
  const commandConfig = buildCommandConfig(config);
  const useRunExecutor = isMigrationFeatureEnabled("runExecutor");
  const useFeishuCards = isMigrationFeatureEnabled("feishuCards");
  const usePendingQueue = isMigrationFeatureEnabled("pendingQueue");
  const usePermissionBroker = isMigrationFeatureEnabled("permissionBroker");
  const useWorkspacePolicy = isMigrationFeatureEnabled("workspacePolicy");
  const callbackConfig = resolveFeishuCallbackConfig(feishu);
  let permissionBroker = null;
  const questionBroker = useRunExecutor && useFeishuCards ? new QuestionBroker() : null;
  let callbackNonceStore = null;
  let callbackServer = null;
  if (usePermissionBroker && callbackConfig.enabled && callbackConfig.port != null) {
    permissionBroker = new PermissionBroker();
    callbackNonceStore = new PersistentCallbackNonceStore({ filePath: CALLBACK_NONCE_PATH });
    callbackServer = await startFeishuCallbackServer({
      Lark,
      host: callbackConfig.host,
      port: callbackConfig.port,
      path: callbackConfig.path,
      encryptKey: feishu.encryptKey || undefined,
      verificationToken: feishu.verificationToken || undefined,
      onAction: (event) => {
        const result = routeFeishuCardAction(event, {
          secret: callbackConfig.signingSecret,
          nonceStore: callbackNonceStore,
          permissionBroker,
          now: Date.now(),
        });
        if (!result.ok) {
          console.warn("feishu callback action rejected", result);
        }
        return null;
      },
    });
  }
  const botIdentity = await resolveBotIdentity(client, feishu.appId, config);

  const shutdown = async (signal) => {
    console.log(`feishu bridge shutting down: ${signal}`);
    await callbackServer?.close();
    await clearPidFile(DEFAULT_PID_PATH);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("exit", () => {
    void clearPidFile(DEFAULT_PID_PATH);
  });

  console.log("feishu bridge started");
  console.log(`feishu app id: ${feishu.appId}`);
  console.log(`feishu mention required: ${String(requireExplicitMention)}`);
  console.log(`feishu mention names: ${Array.from(botIdentity.mentionNames).join(", ") || "(none)"}`);
  if (callbackServer) {
    console.log(`feishu callback server: http://${callbackConfig.host}:${callbackConfig.port}${callbackConfig.path}`);
  }

  wsClient.start({
    eventDispatcher: createFeishuEventDispatcher({
      Lark,
      onMessage: (event) => {
        void (async () => {
          const messageId = event.message?.message_id;
          const chatId = event.message?.chat_id;
          if (!messageId || !chatId) {
            return;
          }

          const routerState = await readRouterState(ROUTER_STATE_PATH);
          const eventDecision = classifyFeishuMessageEvent({
            event,
            routerState,
            botIdentity,
            requireExplicitMention,
            normalizeIncomingText,
          });
          if (eventDecision.reason === "duplicate_message") {
            return;
          }
          if (eventDecision.routerState && eventDecision.routerState !== routerState) {
            routerState.processedMessageIds = eventDecision.routerState.processedMessageIds;
          }
          await writeRouterState(ROUTER_STATE_PATH, routerState);

          await captureFeishuMetadata(botHome, event);

          if (eventDecision.action === "ignore") {
            return;
          }
          if (eventDecision.action === "unsupported_payload") {
            const response = await sendText(client, chatId, renderUnsupportedPayloadMessage(), {
              replyToMessageId: messageId,
            });
            rememberBotOpenId(botIdentity, response);
            return;
          }

          if (eventDecision.action !== "process_text") {
            return;
          }

          const normalizedText = eventDecision.text;
          const explicitlyMentionedBot = eventDecision.explicitlyMentionedBot;
          const envelope = normalizeFeishuEnvelope(event, {
            text: normalizedText,
            explicitlyMentionedBot,
          });
          const accessUser = await upsertFeishuUserFromEvent(event, botHome);
          const usageUserId = accessUser?.id || buildUserId("feishu", envelope.userId);
          if (accessUser && !canFeishuUserAccessChat(accessUser, envelope)) {
            const deniedRun = await createQueuedRun({
              userId: usageUserId,
              conversationId: envelope.conversationId,
              channel: envelope.channel,
              chatType: envelope.chatType,
              chatId,
              messageId,
              visibility: envelope.isDirect ? "private" : "public",
            }, botHome);
            await markRunDenied(
              deniedRun.runId,
              accessUser.status === "banned" ? "user_banned" : "private_chat_locked",
              {},
              botHome,
            );
            const response = await sendText(
              client,
              chatId,
              accessUser.status === "banned" ? "This user is banned from CodexBridge." : renderPrivateChatLockedMessage(accessUser),
              { replyToMessageId: messageId },
            );
            rememberBotOpenId(botIdentity, response);
            return;
          }

          const chatState = ensureConversationState(routerState, envelope);
          const routeKey = chatState.sessionKey || chatState.sessionLabel;
          chatState.updatedAt = nowIso();
          await ensureSession(botHome, chatState);
          await writeRouterState(ROUTER_STATE_PATH, routerState);

          const pendingQuestion = questionBroker?.findPendingQuestion({
            channel: envelope.channel,
            conversationId: envelope.conversationId,
            userId: usageUserId,
          });
          if (pendingQuestion) {
            const answered = questionBroker.answerQuestion({
              runId: pendingQuestion.runId,
              questionId: pendingQuestion.questionId,
              userId: usageUserId,
              answer: normalizedText,
            });
            const answerResponse = await sendText(
              client,
              chatId,
              answered.ok ? "Reply received. CodexBridge will continue this run." : "I could not attach this reply to the pending run. Please try again.",
              { replyToMessageId: messageId },
            );
            rememberBotOpenId(botIdentity, answerResponse);
            return;
          }

          const slashCommand = parseSlashCommand(normalizedText);
          if (slashCommand && await handleSlashCommand(slashCommand, chatState, client, chatId, activeRuns, routeKey, config, envelope, { replyToMessageId: messageId, botHome, user: accessUser })) {
            return;
          }

          const promptText = buildFeishuPrompt(normalizedText, event);
          if (!promptText) {
            return;
          }

          const pendingBefore = pendingCounts.get(routeKey) || 0;
          if (!usePendingQueue && (pendingBefore > 0 || activeRuns.has(routeKey))) {
            const deniedRun = await createQueuedRun({
              userId: usageUserId,
              conversationId: envelope.conversationId,
              channel: envelope.channel,
              chatType: envelope.chatType,
              chatId,
              messageId,
              visibility: envelope.isDirect ? "private" : "public",
            }, botHome);
            await markRunDenied(deniedRun.runId, "running_session", {}, botHome);
            const busyResponse = await sendText(
              client,
              chatId,
              renderBusyMessage(chatState.sessionLabel),
              { replyToMessageId: messageId },
            );
            rememberBotOpenId(botIdentity, busyResponse);
            return;
          }

          const preparedRequest = await prepareChatRequest({
            channel: "feishu",
            externalUserId: envelope.userId,
            displayName: getFeishuUserDisplayName(event),
            envelope,
            chatId,
            messageId,
            conversationId: envelope.conversationId,
            content: promptText,
            deferCharge: usePendingQueue,
            botHome,
          });
          if (!preparedRequest.ok) {
            await appendConversationLogEvent({
              runId: preparedRequest.run?.runId,
              userId: preparedRequest.user?.id,
              channel: envelope.channel,
              chatType: envelope.chatType,
              chatId,
              messageId,
              conversationId: envelope.conversationId,
              direction: "input",
              content: promptText,
              metadata: {
                decision: preparedRequest.decision,
                reason: preparedRequest.reason,
                policy: preparedRequest.policy,
              },
            }, botHome).catch((error) => {
              console.error("feishu conversation input log failed", error);
            });
            await appendConversationLogEvent({
              runId: preparedRequest.run?.runId,
              userId: preparedRequest.user?.id,
              channel: envelope.channel,
              chatType: envelope.chatType,
              chatId,
              messageId,
              conversationId: envelope.conversationId,
              direction: "output",
              content: preparedRequest.message,
              metadata: {
                decision: preparedRequest.decision,
                reason: preparedRequest.reason,
                policy: preparedRequest.policy,
              },
            }, botHome).catch((error) => {
              console.error("feishu conversation output log failed", error);
            });
            const deniedResponse = await sendText(
              client,
              chatId,
              preparedRequest.message,
              { replyToMessageId: messageId },
            );
            rememberBotOpenId(botIdentity, deniedResponse);
            return;
          }
          const isQueuedBehindActive = usePendingQueue && (pendingBefore > 0 || activeRuns.has(routeKey));
          pendingCounts.set(routeKey, pendingBefore + 1);
          if (isQueuedBehindActive) {
            const queuedResponse = await sendText(
              client,
              chatId,
              renderQueuedMessage(chatState.sessionLabel, pendingBefore + 1),
              { replyToMessageId: messageId },
            );
            rememberBotOpenId(botIdentity, queuedResponse);
          }

          const previous = chatQueues.get(routeKey) ?? Promise.resolve();
          const next = previous
            .catch(() => {})
            .then(async () => {
              const chargedRequest = usePendingQueue
                ? await chargePreparedChatRequest(preparedRequest, { botHome })
                : preparedRequest;
              if (!chargedRequest.ok) {
                await appendConversationLogEvent({
                  runId: chargedRequest.run?.runId,
                  userId: chargedRequest.user?.id,
                  channel: envelope.channel,
                  chatType: envelope.chatType,
                  chatId,
                  messageId,
                  conversationId: envelope.conversationId,
                  direction: "output",
                  content: chargedRequest.message,
                  metadata: {
                    decision: chargedRequest.decision,
                    reason: chargedRequest.reason,
                    policy: chargedRequest.policy,
                  },
                }, botHome).catch((error) => {
                  console.error("feishu conversation output log failed", error);
                });
                const deniedResponse = await sendText(
                  client,
                  chatId,
                  chargedRequest.message,
                  { replyToMessageId: messageId },
                );
                rememberBotOpenId(botIdentity, deniedResponse);
                return;
              }
              const runRecord = chargedRequest.run;
              const chargeResult = chargedRequest.charged;
              await appendConversationLogEvent({
                runId: runRecord.runId,
                userId: runRecord.userId,
                channel: envelope.channel,
                chatType: envelope.chatType,
                chatId,
                messageId,
                conversationId: envelope.conversationId,
                direction: "input",
                content: promptText,
                metadata: {
                  costSource: chargeResult.costSource,
                  creditsCharged: chargeResult.charged,
                  policy: chargedRequest.policy,
                  queued: isQueuedBehindActive,
                },
              }, botHome).catch((error) => {
                console.error("feishu conversation input log failed", error);
              });
              const cardController = useFeishuCards
                ? createRunCardController(client, chatId, messageId, botIdentity)
                : null;
              const runPermissionBroker = permissionBroker && cardController
                ? new FeishuPermissionBroker({
                  broker: permissionBroker,
                  cardController,
                  signingSecret: callbackConfig.signingSecret,
                  sessionLabel: chatState.sessionLabel,
                  onError: (error) => {
                    console.error("feishu permission card failed", error);
                  },
                })
                : null;
              const runQuestionBroker = questionBroker && cardController
                ? new FeishuQuestionBroker({
                  broker: questionBroker,
                  cardController,
                  userId: usageUserId,
                  conversationId: envelope.conversationId,
                  sessionLabel: chatState.sessionLabel,
                  onError: (error) => {
                    console.error("feishu question card failed", error);
                  },
                })
                : null;
              const runCommandConfig = buildFeishuRunCommandConfig({
                baseCommandConfig: commandConfig,
                botHome,
                envelope,
                user: accessUser,
                usageUserId,
                config,
                enabled: useWorkspacePolicy,
              });
              const result = await runPreparedFeishuCodexTurn({
                useRunExecutor,
                runRecord,
                chargeResult,
                promptText,
                botHome,
                chatState,
                routeKey,
                commandConfig: runCommandConfig,
                activeRuns,
                envelope,
                chatId,
                messageId,
                permissionBroker: runPermissionBroker,
                questionBroker: runQuestionBroker,
                logEvent: ({ event, level = "info", details = {} } = {}) => {
                  writeLogEvent(console.log, {
                    level,
                    event,
                    details,
                  });
                },
                onRunning: async () => {
                  try {
                    await addReaction(client, messageId);
                  } catch (error) {
                    console.error("feishu running reaction failed", error);
                  }
                },
                deps: {
                  buildWorkspacePrompt,
                },
              });

              const latestState = await readRouterState(ROUTER_STATE_PATH);
              const latestChatState = ensureConversationState(latestState, envelope);
              if (result.ok && result.cliSessionRef) {
                latestChatState.cliSessionRef = result.cliSessionRef;
              }
              latestChatState.updatedAt = nowIso();
              await writeRouterState(ROUTER_STATE_PATH, latestState);
              await ensureSession(botHome, latestChatState);

              if (!result.ok) {
                if (cardController) {
                  await cardController.publish({
                    state: result.stopped ? FEISHU_CARD_STATE.STOPPED : FEISHU_CARD_STATE.FAILED,
                    title: "CodexBridge",
                    sessionLabel: chatState.sessionLabel,
                    errorText: result.stopped ? "" : result.errorText,
                    summary: result.stopped ? "Run stopped." : renderRequestFailedMessage(result.errorText),
                  }, {
                    final: true,
                    fallbackText: renderRequestFailedMessage(result.errorText),
                  });
                } else {
                const failureResponse = await sendText(client, chatId, renderRequestFailedMessage(result.errorText), {
                  replyToMessageId: messageId,
                });
                rememberBotOpenId(botIdentity, failureResponse);
                }
                await appendConversationLogEvent({
                  runId: runRecord.runId,
                  userId: runRecord.userId,
                  channel: envelope.channel,
                  chatType: envelope.chatType,
                  chatId,
                  messageId,
                  conversationId: envelope.conversationId,
                  direction: "output",
                  content: renderRequestFailedMessage(result.errorText),
                  metadata: {
                    ok: false,
                    stopped: Boolean(result.stopped),
                  },
                }, botHome).catch((error) => {
                  console.error("feishu conversation output log failed", error);
                });
                return;
              }

              const outputText = result.outputText || "Done.";
              if (cardController) {
                await cardController.publish({
                  state: FEISHU_CARD_STATE.COMPLETED,
                  title: "CodexBridge",
                  sessionLabel: chatState.sessionLabel,
                  outputText,
                }, {
                  final: true,
                  fallbackText: outputText,
                });
              } else {
                const successResponse = await sendText(client, chatId, outputText, {
                  replyToMessageId: messageId,
                });
                rememberBotOpenId(botIdentity, successResponse);
              }
              await appendConversationLogEvent({
                runId: runRecord.runId,
                userId: runRecord.userId,
                channel: envelope.channel,
                chatType: envelope.chatType,
                chatId,
                messageId,
                conversationId: envelope.conversationId,
                direction: "output",
                content: outputText,
                metadata: {
                  ok: true,
                },
              }, botHome).catch((error) => {
                console.error("feishu conversation output log failed", error);
              });
            })
            .finally(() => {
              const remaining = (pendingCounts.get(routeKey) || 1) - 1;
              if (remaining <= 0) {
                pendingCounts.delete(routeKey);
                if (chatQueues.get(routeKey) === next) {
                  chatQueues.delete(routeKey);
                }
                return;
              }
              pendingCounts.set(routeKey, remaining);
            });

          chatQueues.set(routeKey, next);
          await next;
        })().catch(async (error) => {
          console.error("feishu event handler failed", error);
          const chatId = event.message?.chat_id;
          const messageId = event.message?.message_id;
          if (chatId) {
            const errorResponse = await sendText(client, chatId, renderRequestFailedMessage(error.message), {
              replyToMessageId: messageId,
            });
            rememberBotOpenId(botIdentity, errorResponse);
          }
        });
      },
    }),
  });

  await new Promise(() => {});
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
