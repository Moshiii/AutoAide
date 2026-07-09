import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { confirm as clackConfirm, isCancel as isClackCancel, text as clackText } from "@clack/prompts";
import { pairTelegramChannel } from "./telegram-pairing.mjs";
import { loadFeishuSdk } from "./feishu/sdk-loader.mjs";
import { createCliRenderer } from "./cli-renderer.mjs";
import {
  getBotRuntimePidPath,
  getTelegramStatePath,
  ensureCodexBridgeHome,
  readCliState,
  readConfig,
  writeCliState,
  writeConfig,
  createDefaultCliState,
} from "./config.mjs";
import { DEFAULT_BOT_ID } from "./config.mjs";
import { hydrateTelegramMetadata } from "./telegram-metadata.mjs";
import { getStateMigrationStatus, runStateMigrations } from "./state-migrations.mjs";
import { completeBootstrap, ensureWorkspaceBootstrap } from "./workspace-bootstrap.mjs";
import { createBot, ensureDefaultBot, getBot, listBots, restartBot, setActiveBot, startBot, stopBot, updateBotConfig } from "./bots.mjs";
import { promptSelect } from "./interactive-menu.mjs";
import { getUserCredits, resolveCliCreditsUserId } from "./user-credits.mjs";
import {
  formatSkillInstallResult,
  formatSkillsList,
  formatSkillsOverview,
  installSkillFromPath,
  listSkills,
} from "./skills.mjs";
import { composeStartupBanner, formatKeyValueCard, formatListCard, formatMessageCard, showStartupBanner } from "./ui/banner.mjs";
import {
  formatCliStatus,
  formatLaunchSummary,
  formatStatusOverview,
  getRunningTurn,
  getTelegramConfigView,
} from "./cli-formatters.mjs";
import { requestChildStop } from "./pid-files.mjs";

function isReadlineAbortError(error) {
  return error?.code === "ABORT_ERR" || error?.name === "AbortError" || error?.message === "readline was closed";
}

function isInteractiveTerminal() {
  return Boolean(input?.isTTY && output?.isTTY);
}

function createCliAbortError() {
  const error = new Error("Prompt cancelled.");
  error.code = "ABORT_ERR";
  return error;
}

function restoreInteractiveInput() {
  if (!input?.isTTY) {
    return;
  }
  if (typeof input.setRawMode === "function") {
    input.setRawMode(false);
  }
  if (typeof input.resume === "function") {
    input.resume();
  }
}

function clearInteractiveScreen() {
  if (isInteractiveTerminal()) {
    output.write("\x1b[2J\x1b[H");
  }
}

async function askCliText(rl, message, {
  defaultValue = "",
  placeholder = "",
  required = false,
} = {}) {
  if (isInteractiveTerminal()) {
    try {
      const answer = await clackText({
        message,
        defaultValue,
        placeholder,
        input,
        output,
        validate(value) {
          if (required && !String(value || "").trim()) {
            return "Required.";
          }
          return undefined;
        },
      });
      if (isClackCancel(answer)) {
        throw createCliAbortError();
      }
      return String(answer || "").trim();
    } finally {
      restoreInteractiveInput();
    }
  }

  const prompt = defaultValue ? `${message} [${defaultValue}]: ` : `${message}: `;
  const answer = (await rl.question(prompt)).trim();
  return answer || defaultValue;
}

async function askCliConfirm(rl, message, {
  defaultValue = true,
} = {}) {
  if (isInteractiveTerminal()) {
    try {
      const answer = await clackConfirm({
        message,
        initialValue: defaultValue,
        input,
        output,
      });
      if (isClackCancel(answer)) {
        throw createCliAbortError();
      }
      return Boolean(answer);
    } finally {
      restoreInteractiveInput();
    }
  }

  const suffix = defaultValue ? " [Y/n] " : " [y/N] ";
  const answer = (await rl.question(`${message}${suffix}`)).trim();
  if (!answer) {
    return defaultValue;
  }
  return /^y/i.test(answer);
}

async function waitForCliEnter(rl, message) {
  if (isInteractiveTerminal()) {
    await askCliText(rl, message, {
      defaultValue: "",
      placeholder: "Press Enter when ready",
    });
    return;
  }
  await rl.question("");
}

async function pauseBeforeMenu(rl) {
  if (!isInteractiveTerminal()) {
    return;
  }
  await waitForCliEnter(rl, "Return to menu");
}

async function askCliInputLine(rl, botId) {
  return (await rl.question(`codexbridge:${botId}> `)).trim();
}

function runCodexBridgeTui() {
  const entrypoint = process.argv[1];
  if (!entrypoint) {
    console.log(`${formatMessageCard("TUI", ["Unable to locate the CodexBridge entrypoint. Try: codexbridge tui"])}\n`);
    return;
  }
  const result = spawnSync(process.execPath, [entrypoint, "tui"], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.log(`${formatMessageCard("TUI Failed", [result.error.message])}\n`);
  }
}

async function resolveFeishuAppOwnerUserId(appId, appSecret) {
  const Lark = await loadFeishuSdk({ optional: true });
  if (!Lark) {
    return null;
  }
  const client = new Lark.Client({
    appId,
    appSecret,
    domain: Lark.Domain.Feishu,
  });
  const response = await client.application.v6.application.get({
    params: {
      lang: "zh_cn",
      user_id_type: "user_id",
    },
    path: {
      app_id: appId,
    },
  });
  return String(response?.data?.app?.creator_id || "").trim() || null;
}

async function askBootstrapQuestion(rl, prompt, fallback = "") {
  try {
    const answer = await askCliText(rl, prompt.replace(/:\s*$/, "").trim(), {
      defaultValue: fallback,
      required: !fallback,
    });
    return answer || fallback;
  } catch (error) {
    if (isReadlineAbortError(error)) {
      throw error;
    }
    if (error?.code === "ERR_USE_AFTER_CLOSE") {
      return fallback;
    }
    throw error;
  }
}

async function runBootstrapFlow(rl, bootstrapInfoRef, botContextRef) {
  if (!bootstrapInfoRef.current.bootstrapPending) {
    return;
  }

  console.log(
    `${formatMessageCard("First-Run Setup", [
      "Let's finish first-run setup.",
      "I need a few basics so I can keep them in the workspace and remember them later.",
    ])}\n`,
  );

  const userName = await askBootstrapQuestion(rl, "What should I call you?");
  if (!userName) {
    console.log(`${formatMessageCard("Bootstrap Pending", ["I need your name to continue."])}\n`);
    return;
  }

  const assistantName = await askBootstrapQuestion(
    rl,
    "What should I be called?",
    "CodexBridge",
  );
  const useDefaults = await askCliConfirm(rl, "Use the default assistant style and preferences?", {
    defaultValue: true,
  });
  const wantsCustomSetup = !useDefaults;
  const assistantType = wantsCustomSetup
    ? await askBootstrapQuestion(
      rl,
      "What kind of assistant do you want me to be?",
      "personal operator",
    )
    : "personal operator";
  const vibe = wantsCustomSetup
    ? await askBootstrapQuestion(
      rl,
      "What vibe should I have?",
      "pragmatic, clear, and steady",
    )
    : "pragmatic, clear, and steady";
  const userPreference = wantsCustomSetup
    ? await askBootstrapQuestion(
      rl,
      "Any one-line preference I should remember?",
      "keep it concise",
    )
    : "keep it concise";

  bootstrapInfoRef.current = await completeBootstrap({
    userName,
    assistantName,
    assistantType,
    vibe,
    userPreference,
    creature: "AI assistant",
  }, botContextRef.current.botHome);

  console.log(
    `\n${formatListCard("Bootstrap Complete", [
      `I'll call you ${userName}.`,
      `My name is now ${assistantName}.`,
      "Saved:",
      "- IDENTITY.md",
      "- USER.md",
      "- SOUL.md",
    ])}\n`,
  );
}

async function autoFillTelegramChatIdIfNeeded(config, botHome) {
  const telegram = getTelegramConfigView(config);
  if (!telegram.enabled || !telegram.botToken || telegram.privateAllowedChatIds.length) {
    return;
  }

  try {
    const paired = await pairTelegramChannel(telegram.botToken);
    config.channels.telegram.private = {
      ...(config.channels.telegram.private ?? {}),
      allowedChatIds: [paired.chatId],
    };
    await writeConfig(config, botHome);
  } catch {
    // Keep running without chat filter if we can't resolve latest private chat.
  }
}

async function selectChannelType(rl) {
  const selection = await promptSelect({
    rl,
    input,
    output,
    title: "Connect A Channel",
    items: [
      { label: "Telegram  Pair a bot token and private chat", value: "telegram" },
      { label: "Feishu   Configure a self-built app", value: "feishu" },
    ],
    hintLines: [
      "Use ↑/↓ and Enter. Esc cancels.",
    ],
    defaultIndex: 0,
    fallbackPrompt: "Channel [1=Telegram, 2=Feishu, q=cancel]: ",
  });

  if (selection.action === "cancel") {
    return null;
  }
  return selection.value;
}

async function handleTelegramChannelSetup(rl, botContextRef, config, bridgeProcessRef) {
  console.log(
    `\n${formatListCard("Telegram Pairing", [
      "Open Telegram and message @BotFather.",
      "Create a bot with /newbot, then paste the bot token here.",
      "After pasting the token, send one message to your bot so CodexBridge can pair the private chat.",
    ])}\n`,
  );

  const token = await askCliText(rl, "Telegram bot token", {
    required: true,
  });
  if (!token) {
    console.log(`${formatMessageCard("Telegram Pairing", ["Pairing cancelled."])}\n`);
    return;
  }

  const currentBot = await getBot(botContextRef.current.botId);
  const currentTelegram = config.channels?.telegram ?? {};
  const hadRunningRuntime = Boolean(currentBot.runtimePid);
  let shouldRestoreRuntime = hadRunningRuntime;

  if (hadRunningRuntime) {
    console.log(`${formatMessageCard("Telegram Pairing", ["Pausing the current bot runtime so pairing can read Telegram updates cleanly..."])}\n`);
    await stopBot(botContextRef.current.botId).catch(() => {});
    bridgeProcessRef.current = { pid: null };
  }

  console.log(`\n${formatMessageCard("Telegram Pairing", ["Now send one message to your bot in Telegram, then press Enter here."])}\n`);
  await waitForCliEnter(rl, "I sent a Telegram message to the bot");

  try {
    let paired = null;
    try {
      paired = await pairTelegramChannel(token);
    } catch (error) {
      const existingChatId = currentTelegram.private?.allowedChatIds?.[0] ?? null;
      if (currentTelegram.botToken === token && existingChatId) {
        paired = {
          chatId: String(existingChatId),
          userId: String(currentTelegram.groups?.allowedUserIds?.[0] ?? currentTelegram.private?.allowedChatIds?.[0]),
          username: currentTelegram.botUsername || null,
        };
      } else {
        throw error;
      }
    }
    config = await updateBotConfig(botContextRef.current.botId, (currentConfig) => {
      const existingGroupUserIds = currentConfig.channels?.telegram?.groups?.allowedUserIds ?? [];
      return {
        ...currentConfig,
        channel: "telegram",
        ownerUserId: currentConfig.ownerUserId || paired.userId,
        adminUserIds: currentConfig.adminUserIds?.length
          ? currentConfig.adminUserIds
          : [paired.userId],
        enabled: true,
        channels: {
          ...currentConfig.channels,
          telegram: {
            enabled: true,
            botToken: token,
            botUsername: paired.botUsername || currentConfig.channels?.telegram?.botUsername || "",
            metadata: {
              chats: {
                ...(currentConfig.channels?.telegram?.metadata?.chats ?? {}),
                [paired.chatId]: {
                  type: "private",
                  username: paired.userUsername ?? null,
                  label: paired.userUsername ? `@${paired.userUsername.replace(/^@+/, "")}` : null,
                },
              },
              users: {
                ...(currentConfig.channels?.telegram?.metadata?.users ?? {}),
                [paired.userId]: {
                  username: paired.userUsername ?? null,
                  label: paired.userUsername ? `@${paired.userUsername.replace(/^@+/, "")}` : null,
                },
              },
            },
            private: {
              allowedChatIds: [paired.chatId],
            },
            groups: {
              allowedChatIds: currentConfig.channels?.telegram?.groups?.allowedChatIds ?? [],
              allowedUserIds: Array.from(new Set([...existingGroupUserIds, paired.userId])),
              requireExplicitMention: currentConfig.channels?.telegram?.groups?.requireExplicitMention ?? true,
            },
          },
        },
      };
    });
    shouldRestoreRuntime = false;
    try {
      bridgeProcessRef.current = {
        pid: await startBot(botContextRef.current.botId),
      };
    } catch {
      bridgeProcessRef.current = {
        pid: (await getBot(botContextRef.current.botId)).runtimePid,
      };
    }

    console.log(
      `${formatKeyValueCard("Telegram Paired", [
        ["status", "paired successfully"],
        ["chat id", String(paired.chatId)],
        ["owner user id", String(config.ownerUserId || paired.userId)],
        ...(paired.botUsername ? [["bot username", `@${paired.botUsername}`]] : []),
        ...(paired.userUsername ? [["paired user", `@${paired.userUsername}`]] : []),
      ])}\n`,
    );
  } catch (error) {
    console.log(`${formatMessageCard("Telegram Pairing Failed", [error.message])}\n`);
    if (shouldRestoreRuntime && currentTelegram.enabled && currentTelegram.botToken) {
      try {
        bridgeProcessRef.current = {
          pid: await startBot(botContextRef.current.botId),
        };
      } catch {
        bridgeProcessRef.current = {
          pid: (await getBot(botContextRef.current.botId)).runtimePid,
        };
      }
    }
  }
}

async function handleFeishuChannelSetup(rl, botContextRef, config, bridgeProcessRef) {
  console.log(
    `\n${formatListCard("Feishu Setup", [
      "Create a self-built app in Feishu Open Platform.",
      "Enable bot capability, IM permissions, and subscribe to im.message.receive_v1.",
      "This bridge uses long connection mode, so no public webhook URL is required.",
      "Install or publish the app into the tenant where you want to chat with it.",
      "Then open a chat with the app and send a plain text message.",
    ])}\n`,
  );

  console.log(
    `${formatListCard("Feishu Checklist", [
      "1. Open https://open.feishu.cn/app and create a self-built app.",
      "2. In App Features, enable the bot so the app can be chatted with in Feishu.",
      "3. In Permission Management, enable the IM message scopes needed for receiving and sending messages.",
      "4. In Event Subscriptions, add im.message.receive_v1.",
      "5. This bridge uses long connection mode, so you do not need to configure a public request URL.",
      "6. Install or publish the app to the target workspace or tenant before testing.",
      "7. If the bot is intended for group chats, make sure it can be added to chats/groups.",
    ])}\n`,
  );

  const appId = await askCliText(rl, "Feishu app id", {
    required: true,
  });
  const appSecret = await askCliText(rl, "Feishu app secret", {
    required: true,
  });
  if (!appId || !appSecret) {
    console.log(`${formatMessageCard("Feishu Setup", ["Setup cancelled."])}\n`);
    return;
  }

  try {
    let detectedOwnerUserId = null;
    try {
      detectedOwnerUserId = await resolveFeishuAppOwnerUserId(appId, appSecret);
    } catch {
      detectedOwnerUserId = null;
    }
    const currentBot = await getBot(botContextRef.current.botId);
    const hadRunningRuntime = Boolean(currentBot.runtimePid);
    if (hadRunningRuntime) {
      console.log(`${formatMessageCard("Feishu Setup", ["Restarting the current bot runtime so the Feishu bridge can take over..."])}\n`);
      await stopBot(botContextRef.current.botId).catch(() => {});
      bridgeProcessRef.current = { pid: null };
    }

    config = await updateBotConfig(botContextRef.current.botId, (currentConfig) => ({
      ...currentConfig,
      channel: "feishu",
      ownerUserId: currentConfig.ownerUserId || detectedOwnerUserId || "",
      adminUserIds:
        currentConfig.adminUserIds?.length
          ? currentConfig.adminUserIds
          : detectedOwnerUserId
            ? [detectedOwnerUserId]
            : [],
      enabled: true,
      channels: {
        ...currentConfig.channels,
        feishu: {
          ...(currentConfig.channels?.feishu ?? {}),
          enabled: true,
          appId,
          appSecret,
          requireExplicitMention: currentConfig.channels?.feishu?.requireExplicitMention ?? true,
        },
      },
    }));

    try {
      bridgeProcessRef.current = {
        pid: await startBot(botContextRef.current.botId),
      };
    } catch {
      bridgeProcessRef.current = {
        pid: (await getBot(botContextRef.current.botId)).runtimePid,
      };
    }

    console.log(
      `${formatKeyValueCard("Feishu Enabled", [
        ["status", "configured successfully"],
        ["app id", appId],
        ["owner user id", config.ownerUserId || detectedOwnerUserId || "unknown"],
        ["mode", "long connection"],
        ["next step", "In Feishu, send a plain text message to the app after bot capability, event subscription, and tenant installation are all configured"],
        ["if no reply", "Check App Features -> Bot, Event Subscriptions -> im.message.receive_v1, and whether the app is installed/published in your tenant"],
      ])}\n`,
    );
  } catch (error) {
    console.log(`${formatMessageCard("Feishu Setup Failed", [error.message])}\n`);
  }
}

async function handleChannelCommand(rl, botContextRef, config, bridgeProcessRef) {
  const selection = await selectChannelType(rl);
  if (!selection) {
    return;
  }
  if (selection === "telegram") {
    await handleTelegramChannelSetup(rl, botContextRef, config, bridgeProcessRef);
    return;
  }
  await handleFeishuChannelSetup(rl, botContextRef, config, bridgeProcessRef);
}

function requestStop(turn) {
  if (!turn) {
    return false;
  }
  turn.stopRequested = true;
  return requestChildStop(turn.child);
}

async function loadCliBotContext(botId) {
  const bot = await getBot(botId);
  const botHome = bot.homePath;
  let config = await readConfig(botHome);
  config = await hydrateTelegramMetadata(botHome).catch(() => config);
  await autoFillTelegramChatIdIfNeeded(config, botHome);
  const cliState = await readCliState(botHome);
  if (!cliState.sessions?.main) {
    const fresh = createDefaultCliState();
    cliState.sessions = fresh.sessions;
    cliState.activeSessionLabel = fresh.activeSessionLabel;
    await writeCliState(cliState, botHome);
  }
  return {
    botId: bot.id,
    botHome,
    bot,
    config: await readConfig(botHome),
    cliState,
    bootstrapInfo: await ensureWorkspaceBootstrap(botHome),
    runtimePid: (await getBot(bot.id)).runtimePid,
  };
}

async function switchCliBot(botId, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef) {
  const next = await loadCliBotContext(botId);
  botContextRef.current = {
    botId: next.botId,
    botHome: next.botHome,
  };
  configRef.current = next.config;
  cliStateRef.current = next.cliState;
  bootstrapInfoRef.current = next.bootstrapInfo;
  bridgeProcessRef.current = {
    pid: next.runtimePid,
  };
  await setActiveBot(next.botId);
  return next;
}

function formatBotPickerLabel(bot, currentBotId) {
  const tags = [
    bot.id === currentBotId ? "current" : null,
    bot.enabled ? "enabled" : "disabled",
    bot.runtimePid ? "online" : "offline",
    bot.channel || "telegram",
  ].filter(Boolean).join(", ");
  return `${bot.id.padEnd(14)} ${bot.name} [${tags}]`;
}

async function promptForBotBasics(rl, defaults = {}) {
  const providedName = String(defaults.name || "").trim();
  const name = await askCliText(rl, "Bot name", {
    defaultValue: providedName,
    required: !providedName,
  });
  if (!name) {
    return null;
  }
  const id = defaults.id || await generateBotId();
  if (!id) {
    return null;
  }
  return { id, name };
}

async function generateBotId() {
  const existing = new Set((await listBots()).map((bot) => String(bot.id)));
  for (let value = 1000; value <= 9999; value += 1) {
    const id = String(value);
    if (!existing.has(id)) {
      return id;
    }
  }
  throw new Error("No available 4-digit bot id.");
}

async function createBotInteractive(rl, botContextRef) {
  console.log(`${formatMessageCard("New Bot", ["Create a bot with a short name. I will generate a 4-digit id for it."])}\n`);
  const basics = await promptForBotBasics(rl);
  if (!basics) {
    console.log(`${formatMessageCard("New Bot", ["Creation cancelled."])}\n`);
    return null;
  }
  const created = await createBot({
    id: basics.id,
    name: basics.name,
    enabled: false,
  });
  console.log(
    `${formatKeyValueCard("Bot Created", [
      ["id", created.id],
      ["name", basics.name],
      ["status", "disabled until configured"],
      ["next step", "Open /bots and press Enter to switch, or use /connect to configure a channel"],
    ])}\n`,
  );
  return created;
}

async function openBotPicker(rl, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns) {
  let highlightedBotId = botContextRef.current.botId;

  while (true) {
    clearInteractiveScreen();
    const bots = await listBots();
    const currentIndex = Math.max(0, bots.findIndex((bot) => bot.id === highlightedBotId || bot.id === botContextRef.current.botId));
    const items = [
      ...bots.map((bot) => ({
        label: formatBotPickerLabel(bot, botContextRef.current.botId),
        value: bot.id,
      })),
      { label: "new bot", value: "__new_bot__" },
    ];
    const choice = await promptSelect({
      rl,
      input,
      output,
      title: "Bots",
      items,
      headerLines: isInteractiveTerminal() ? composeStartupBanner() : [],
      defaultIndex: currentIndex,
      fallbackPrompt: "Bot [number, q=cancel]: ",
    });

    if (choice.action === "cancel") {
      return false;
    }

    if (choice.value === "__new_bot__") {
      const created = await createBotInteractive(rl, botContextRef);
      if (created?.id) {
        highlightedBotId = created.id;
        await pauseBeforeMenu(rl);
      }
      continue;
    }

    const targetBotId = choice.value || bots[currentIndex]?.id || botContextRef.current.botId;
    highlightedBotId = targetBotId;

    if (targetBotId === botContextRef.current.botId) {
      return true;
    }
    if (Array.from(runningTurns.values()).some(Boolean)) {
      console.log(`${formatMessageCard("Bot Switch Failed", ["Stop running turns before switching bots."])}\n`);
      await pauseBeforeMenu(rl);
      return true;
    }
    await switchCliBot(targetBotId, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef);
    return "changed";
  }
}

async function restartBotRuntime(botId) {
  return await restartBot(botId);
}

async function resolveRuntimeErrorMessage(error, botId) {
  const message = error?.message || String(error || "Unknown runtime error.");
  try {
    const bot = await getBot(botId);
    if (bot.lastError && bot.lastError !== message) {
      return bot.lastError;
    }
  } catch {
    // Keep the original runtime error when bot state cannot be read.
  }
  return message;
}

function getCodexCliStatus() {
  if (String(process.env.CODEX_START_COMMAND || "").trim()) {
    return "custom command";
  }

  const result = spawnSync("codex", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 2000,
  });

  if (result.error?.code === "ENOENT") {
    return "not found";
  }
  if (result.error) {
    return `unavailable (${result.error.code || result.error.message})`;
  }
  if (result.status !== 0) {
    return "unavailable";
  }

  const versionLine = String(result.stdout || result.stderr || "").trim().split(/\r?\n/)[0];
  return versionLine || "available";
}

async function buildLaunchSummary(botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef) {
  configRef.current = await readConfig(botContextRef.current.botHome);
  bridgeProcessRef.current = {
    pid: (await getBot(botContextRef.current.botId)).runtimePid,
  };
  return formatLaunchSummary(
    botContextRef.current,
    configRef.current,
    bridgeProcessRef.current,
    cliStateRef.current,
    bootstrapInfoRef.current,
    getCodexCliStatus(),
  );
}

async function showLaunchSummary(botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef) {
  console.log(`${await buildLaunchSummary(botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef)}\n`);
}

function printHelpCard() {
  console.log(
    `${formatListCard("Commands", [
      "/menu     open the CodexBridge menu",
      "/bots     open the interactive bot picker",
      "/new      create a new bot with prompts",
      "/connect  configure Telegram or Feishu",
      "/memory   personalize memory files when setup is pending",
      "/status   show full details",
      "/stop     stop the current running turn",
      "/restart  restart the current bot runtime",
      "/exit     quit CodexBridge",
    ])}\n`,
  );
}

async function showCliStatus(botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns, options = {}) {
  const mode = options.mode || "summary";
  configRef.current = await readConfig(botContextRef.current.botHome);
  bridgeProcessRef.current = {
    pid: (await getBot(botContextRef.current.botId)).runtimePid,
  };
  const creditsInfo = await getUserCredits(
    resolveCliCreditsUserId(configRef.current),
    botContextRef.current.botHome,
  );
  console.log(
    `${formatStatusOverview(
      botContextRef.current,
      configRef.current,
      bridgeProcessRef.current,
      cliStateRef.current,
      bootstrapInfoRef.current,
      creditsInfo,
    )}\n`,
  );
  if (mode === "full") {
    console.log(
      `${formatCliStatus(
        botContextRef.current,
        configRef.current,
        bridgeProcessRef.current,
        cliStateRef.current,
        bootstrapInfoRef.current,
        creditsInfo,
      )}\n`,
    );
  }
  console.log(
    `${formatKeyValueCard("Run State", [
      ["current session", cliStateRef.current.activeSessionLabel],
      ["running", getRunningTurn(runningTurns, cliStateRef.current.activeSessionLabel) ? "yes" : "no"],
    ])}\n`,
  );
}

async function openMainMenu(rl, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns, options = {}) {
  const clearScreen = options.clearScreen ?? isInteractiveTerminal();
  const headerLines = [];
  if (clearScreen) {
    clearInteractiveScreen();
    headerLines.push(...composeStartupBanner());
    headerLines.push(await buildLaunchSummary(botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef));
  }
  const items = [
    { label: "Start chat with current bot", value: "chat" },
    { label: "Start runtime", value: "start-runtime" },
    { label: "Stop runtime", value: "stop-runtime" },
    { label: "Restart runtime", value: "restart-runtime" },
    { label: "Switch bots", value: "bots" },
    { label: "Connect Telegram or Feishu", value: "connect" },
    { label: "User management", value: "users" },
  ];
  items.push(
    { label: "Show help", value: "help" },
    { label: "Exit CodexBridge", value: "exit" },
  );

  const choice = await promptSelect({
    rl,
    input,
    output,
    title: `CodexBridge Menu · ${botContextRef.current.botId}`,
    items,
    headerLines,
    defaultIndex: 0,
    hintLines: [
      "Choose an action. Ctrl+C twice exits.",
    ],
    fallbackPrompt: `Action [1-${items.length}, q=cancel]: `,
  });

  if (choice.action === "cancel") {
    return "cancel";
  }

  if (choice.value === "chat") {
    runCodexBridgeTui();
    return true;
  }
  if (choice.value === "start-runtime") {
    try {
      bridgeProcessRef.current = {
        pid: await startBot(botContextRef.current.botId),
      };
      console.log(`${formatKeyValueCard("Runtime Started", [["runtime pid", String(bridgeProcessRef.current.pid)]])}\n`);
    } catch (error) {
      console.log(`${formatMessageCard("Runtime Start Failed", [await resolveRuntimeErrorMessage(error, botContextRef.current.botId)])}\n`);
    }
    await pauseBeforeMenu(rl);
    return true;
  }
  if (choice.value === "stop-runtime") {
    try {
      await stopBot(botContextRef.current.botId);
      bridgeProcessRef.current = { pid: null };
      console.log(`${formatMessageCard("Runtime Stopped", [`Stopped bot ${botContextRef.current.botId}.`])}\n`);
    } catch (error) {
      console.log(`${formatMessageCard("Runtime Stop Failed", [error.message])}\n`);
    }
    await pauseBeforeMenu(rl);
    return true;
  }
  if (choice.value === "restart-runtime") {
    try {
      bridgeProcessRef.current = {
        pid: await restartBotRuntime(botContextRef.current.botId),
      };
      console.log(`${formatKeyValueCard("Runtime Restarted", [["runtime pid", String(bridgeProcessRef.current.pid)]])}\n`);
    } catch (error) {
      console.log(`${formatMessageCard("Runtime Restart Failed", [await resolveRuntimeErrorMessage(error, botContextRef.current.botId)])}\n`);
    }
    await pauseBeforeMenu(rl);
    return true;
  }
  if (choice.value === "bots") {
    const botAction = await openBotPicker(rl, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns);
    if (botAction === "changed") {
      console.log(`${formatMessageCard("Active Bot", [`Switched to ${botContextRef.current.botId}.`])}\n`);
      await pauseBeforeMenu(rl);
      return true;
    }
    return true;
  }
  if (choice.value === "new-bot") {
    await createBotInteractive(rl, botContextRef);
    return true;
  }
  if (choice.value === "connect") {
    await handleChannelCommand(rl, botContextRef, configRef.current, bridgeProcessRef);
    configRef.current = await readConfig(botContextRef.current.botHome);
    return true;
  }
  if (choice.value === "users") {
    console.log(`${formatMessageCard("User Management", [
      "User access, credits, and bans are managed in the web control plane.",
      "Run: codexbridge web",
    ])}\n`);
    await pauseBeforeMenu(rl);
    return true;
  }
  if (choice.value === "help") {
    printHelpCard();
    await pauseBeforeMenu(rl);
    return true;
  }
  if (choice.value === "exit") {
    rl?.close();
    return "exit";
  }
  return true;
}

async function handleSlashCommand(line, rl, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns, renderer) {
  const [command, ...rest] = line.trim().split(/\s+/);
  const arg = rest.join(" ").trim();
  const cliState = cliStateRef.current;

  switch (command) {
    case "/help":
      printHelpCard();
      return true;
    case "/menu":
      return await openMainMenu(rl, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns);
    case "/bots":
      if (await openBotPicker(rl, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns) === "changed") {
        console.log(`Active bot: ${botContextRef.current.botId}\n`);
      }
      return true;
    case "/new":
      try {
        await createBotInteractive(rl, botContextRef);
      } catch (error) {
        console.log(`${formatMessageCard("Bot Create Failed", [error.message])}\n`);
      }
      return true;
    case "/connect":
      await handleChannelCommand(rl, botContextRef, configRef.current, bridgeProcessRef);
      configRef.current = await readConfig(botContextRef.current.botHome);
      return true;
    case "/memory": {
      const wasPending = bootstrapInfoRef.current.bootstrapPending;
      await runBootstrapFlow(rl, bootstrapInfoRef, botContextRef);
      if (!wasPending) {
        console.log(`${formatMessageCard("Memory", ["Memory personalization is already complete."])}\n`);
      }
      return true;
    }
    case "/me":
      await showCliStatus(botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns, { mode: "summary" });
      return true;
    case "/bot": {
      const [subcommand, ...botRest] = arg.split(/\s+/).filter(Boolean);
      if (!subcommand || subcommand === "list") {
        await openBotPicker(rl, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns);
        return true;
      }
      if (subcommand === "create") {
        try {
          const id = botRest.shift();
          const name = botRest.join(" ").trim();
          if (!id) {
            await createBotInteractive(rl, botContextRef);
            return true;
          }
          const created = await createBot({ id, name: name || id, enabled: false });
          console.log(`${formatMessageCard("Bot Created", [`${created.id} at ${created.homePath}`])}\n`);
        } catch (error) {
          console.log(`${formatMessageCard("Bot Create Failed", [error.message])}\n`);
        }
        return true;
      }
      if (subcommand === "use") {
        const botId = botRest[0];
        if (!botId) {
          console.log(`${formatMessageCard("Usage", ["/bot use <id>"])}\n`);
          return true;
        }
        if (Array.from(runningTurns.values()).some(Boolean)) {
          console.log(`${formatMessageCard("Bot Switch Failed", ["Stop running turns before switching bots."])}\n`);
          return true;
        }
        try {
          await switchCliBot(botId, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef);
        } catch (error) {
          console.log(`${formatMessageCard("Bot Switch Failed", [error.message])}\n`);
        }
        return true;
      }
      if (subcommand === "show") {
        const botId = botRest[0] || botContextRef.current.botId;
        try {
          const bot = await getBot(botId);
          const config = await readConfig(bot.homePath);
          console.log(`${formatKeyValueCard("Bot", [
            ["id", bot.id],
            ["name", bot.name],
            ["status", bot.status],
            ["home", bot.homePath],
            ["enabled", bot.enabled ? "yes" : "no"],
            ["channel", config.channel || "telegram"],
            ["telegram paired", config.channels?.telegram?.enabled ? "yes" : "no"],
            ["feishu enabled", config.channels?.feishu?.enabled ? "yes" : "no"],
          ])}\n`);
        } catch (error) {
          console.log(`${formatMessageCard("Bot Show Failed", [error.message])}\n`);
        }
        return true;
      }
      console.log(`${formatMessageCard("Usage", ["/bots", "/bot create <id> [name]", "/bot use <id>", "/bot show [id]"])}\n`);
      return true;
    }
    case "/channel":
      await handleChannelCommand(rl, botContextRef, configRef.current, bridgeProcessRef);
      configRef.current = await readConfig(botContextRef.current.botHome);
      return true;
    case "/status":
      await showCliStatus(botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns, {
        mode: "full",
      });
      return true;
    case "/credits": {
      configRef.current = await readConfig(botContextRef.current.botHome);
      const creditsInfo = await getUserCredits(
        resolveCliCreditsUserId(configRef.current),
        botContextRef.current.botHome,
      );
      console.log(
        `${formatKeyValueCard("Credits", [
          ["user id", creditsInfo.account.userId],
          ["remaining", String(creditsInfo.account.balance)],
          ["turn cost", String(creditsInfo.defaults.turnCost)],
          ["total consumed", String(creditsInfo.account.totalConsumed)],
        ])}\n`,
      );
      return true;
    }
    case "/migrate": {
      try {
        const dryRun = rest.includes("--dry-run") || rest.includes("dry-run");
        const before = await getStateMigrationStatus({ botHome: botContextRef.current.botHome });
        const result = await runStateMigrations({
          botHome: botContextRef.current.botHome,
          dryRun,
        });
        const after = await getStateMigrationStatus({ botHome: botContextRef.current.botHome });
        console.log(
          `${formatKeyValueCard(dryRun ? "State Migration Dry Run" : "State Migration", [
            ["bot", botContextRef.current.botId],
            ["schema before", String(before.schemaVersion)],
            ["schema after", String(after.schemaVersion)],
            ["executed", String(result.executed.length)],
            ["pending", String(after.pending.length)],
          ])}\n`,
        );
        const visibleItems = dryRun ? result.pending : result.executed;
        if (visibleItems.length) {
          console.log(
            `${formatListCard(
              dryRun ? "Pending Migrations" : "Executed Migrations",
              visibleItems.map((migration) => `- ${migration.id}: ${migration.description}`),
            )}\n`,
          );
        }
      } catch (error) {
        console.log(`${formatMessageCard("Migration Failed", [error.message])}\n`);
      }
      return true;
    }
    case "/stop": {
      const turn = getRunningTurn(runningTurns, cliState.activeSessionLabel);
      if (!turn) {
        console.log(`${formatMessageCard("Stop", [`No running task for ${cliState.activeSessionLabel}.`])}\n`);
        return true;
      }
      const stopped = requestStop(turn);
      if (stopped) {
        renderer.updateRunStatus(`Stopping ${cliState.activeSessionLabel}...`);
      } else {
        console.log(`${formatMessageCard("Stop", [`Unable to stop ${cliState.activeSessionLabel}.`])}\n`);
      }
      return true;
    }
    case "/restart":
      console.log(`${formatMessageCard("Restarting", [`Restarting bot ${botContextRef.current.botId}...`])}\n`);
      bridgeProcessRef.current = {
        pid: await restartBotRuntime(botContextRef.current.botId),
      };
      console.log(
        `${formatKeyValueCard("Runtime Restarted", [["runtime pid", String(bridgeProcessRef.current.pid)]])}\n`,
      );
      return true;
    case "/exit":
      rl.close();
      return "exit";
    default:
      if (command.startsWith("/")) {
        console.log(`${formatMessageCard("Unknown Command", [command])}\n`);
        return true;
      }
      return false;
  }
}

export async function startCli({ botId = DEFAULT_BOT_ID } = {}) {
  await ensureCodexBridgeHome();
  await ensureDefaultBot();
  const initial = await loadCliBotContext(botId);
  const botContextRef = {
    current: {
      botId: initial.botId,
      botHome: initial.botHome,
    },
  };
  const bootstrapInfoRef = { current: initial.bootstrapInfo };
  const configRef = { current: initial.config };
  const cliStateRef = { current: initial.cliState };
  const bridgeProcessRef = { current: { pid: initial.runtimePid } };
  const runningTurns = new Map();
  const renderer = createCliRenderer({ input, output });
  let startupAction = null;
  let menuCancelCount = 0;

  if (isInteractiveTerminal()) {
    await showStartupBanner({
      botId: botContextRef.current.botId,
      model: configRef.current.runtime?.model || "gpt-5.4",
    });
    await showLaunchSummary(botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef);
    startupAction = await openMainMenu(
      null,
      botContextRef,
      configRef,
      bridgeProcessRef,
      cliStateRef,
      bootstrapInfoRef,
      runningTurns,
      { clearScreen: false },
    );
    if (startupAction === "exit") {
      renderer.dispose();
      return;
    }
    if (startupAction === "cancel") {
      menuCancelCount += 1;
    } else {
      menuCancelCount = 0;
    }
  }

  const rl = createInterface({ input, output });

  if (isInteractiveTerminal()) {
    while (true) {
      const action = await openMainMenu(rl, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns);
      if (action === "exit") {
        renderer.dispose();
        rl.close();
        return;
      }
      if (action === "cancel") {
        menuCancelCount += 1;
        if (menuCancelCount >= 2) {
          renderer.dispose();
          rl.close();
          return;
        }
        continue;
      }
      menuCancelCount = 0;
    }
  }

  while (true) {
    let line;
    try {
      restoreInteractiveInput();
      line = await askCliInputLine(rl, botContextRef.current.botId);
    } catch (error) {
      if (isReadlineAbortError(error)) {
        rl.close();
        renderer.dispose();
        output.write("\n");
        return;
      }
      if (error?.code === "ERR_USE_AFTER_CLOSE") {
        renderer.dispose();
        return;
      }
      throw error;
    }
    if (!line) {
      const action = await openMainMenu(rl, botContextRef, configRef, bridgeProcessRef, cliStateRef, bootstrapInfoRef, runningTurns);
      if (action === "exit") {
        return;
      }
      continue;
    }
    const handled = await handleSlashCommand(
      line,
      rl,
      botContextRef,
      configRef,
      bridgeProcessRef,
      cliStateRef,
      bootstrapInfoRef,
      runningTurns,
      renderer,
    );
    if (handled === "exit") {
      renderer.dispose();
      return;
    }
    if (handled) {
      continue;
    }
    console.log(`${formatMessageCard("Chat Moved to TUI", [
      "The CodexBridge management CLI no longer runs chat turns directly.",
      "Choose Start chat with current bot from /menu, or run: codexbridge tui",
    ])}\n`);
    if (!isInteractiveTerminal()) {
      renderer.dispose();
      rl.close();
      return;
    }
  }
}
