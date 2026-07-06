import { UserInputError } from "./errors.mjs";

export const REDACTED_SECRET = "[redacted]";

const PLACEHOLDER_TOKEN_PATTERNS = [
  /^bot[-_\s]?token$/i,
  /^token-\d+$/i,
  /^real[-_\s]?token$/i,
  /^your[-_\s]?telegram[-_\s]?token$/i,
  /^your[-_\s]?token[-_\s]?here$/i,
  /^placeholder$/i,
  /^changeme$/i,
  /^example/i,
  /^test[-_\s]?token/i,
];
const BOTFATHER_TOKEN_PATTERN = /^\d{5,20}:[A-Za-z0-9_-]{20,}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMergeConfig(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch;
  }

  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] = isPlainObject(value) ? deepMergeConfig(base[key] ?? {}, value) : value;
  }
  return merged;
}

function isPlaceholderToken(value) {
  const token = String(value || "").trim();
  if (!token) {
    return false;
  }
  return PLACEHOLDER_TOKEN_PATTERNS.some((pattern) => pattern.test(token));
}

export function assertSafeTelegramToken(token) {
  const normalized = String(token || "").trim();
  if (isPlaceholderToken(normalized)) {
    throw new UserInputError("Refusing to save placeholder Telegram token.", {
      code: "placeholder_telegram_token",
    });
  }
  if (normalized && !BOTFATHER_TOKEN_PATTERN.test(normalized)) {
    throw new UserInputError("Telegram bot token must use the BotFather format '<digits>:<token>'.", {
      code: "invalid_telegram_token",
    });
  }
}

function isRedactedSecret(value) {
  return String(value || "").trim() === REDACTED_SECRET;
}

function redactSecret(value) {
  return String(value || "").trim() ? REDACTED_SECRET : "";
}

export function redactConfigSecrets(config) {
  return {
    ...config,
    channels: {
      ...(config.channels || {}),
      telegram: {
        ...(config.channels?.telegram || {}),
        botToken: redactSecret(config.channels?.telegram?.botToken),
      },
      feishu: {
        ...(config.channels?.feishu || {}),
        appSecret: redactSecret(config.channels?.feishu?.appSecret),
        verificationToken: redactSecret(config.channels?.feishu?.verificationToken),
        encryptKey: redactSecret(config.channels?.feishu?.encryptKey),
        callback: {
          ...(config.channels?.feishu?.callback || {}),
          signingSecret: redactSecret(config.channels?.feishu?.callback?.signingSecret),
        },
      },
    },
  };
}

export function redactControlPlaneDetail(detail) {
  return {
    ...detail,
    detail: {
      ...detail.detail,
      config: redactConfigSecrets(detail.detail.config),
    },
  };
}

export function applySafeConfigPatch(currentConfig, patch) {
  const nextConfig = deepMergeConfig(currentConfig, patch);
  const nextToken = nextConfig.channels?.telegram?.botToken;
  const currentToken = currentConfig.channels?.telegram?.botToken || "";
  if (isRedactedSecret(nextToken)) {
    nextConfig.channels.telegram.botToken = currentToken;
  }
  if (typeof nextToken === "string" && nextToken.trim() !== currentToken.trim()) {
    if (!nextToken.trim()) {
      return nextConfig;
    }
    if (!isRedactedSecret(nextToken)) {
      assertSafeTelegramToken(nextToken);
    }
  }

  const nextFeishuSecret = nextConfig.channels?.feishu?.appSecret;
  const currentFeishuSecret = currentConfig.channels?.feishu?.appSecret || "";
  if (isRedactedSecret(nextFeishuSecret)) {
    nextConfig.channels.feishu.appSecret = currentFeishuSecret;
  }
  const nextFeishuVerificationToken = nextConfig.channels?.feishu?.verificationToken;
  const currentFeishuVerificationToken = currentConfig.channels?.feishu?.verificationToken || "";
  if (isRedactedSecret(nextFeishuVerificationToken)) {
    nextConfig.channels.feishu.verificationToken = currentFeishuVerificationToken;
  }
  const nextFeishuEncryptKey = nextConfig.channels?.feishu?.encryptKey;
  const currentFeishuEncryptKey = currentConfig.channels?.feishu?.encryptKey || "";
  if (isRedactedSecret(nextFeishuEncryptKey)) {
    nextConfig.channels.feishu.encryptKey = currentFeishuEncryptKey;
  }
  const nextFeishuCallbackSigningSecret = nextConfig.channels?.feishu?.callback?.signingSecret;
  const currentFeishuCallbackSigningSecret = currentConfig.channels?.feishu?.callback?.signingSecret || "";
  if (isRedactedSecret(nextFeishuCallbackSigningSecret)) {
    nextConfig.channels.feishu.callback.signingSecret = currentFeishuCallbackSigningSecret;
  }
  return nextConfig;
}
