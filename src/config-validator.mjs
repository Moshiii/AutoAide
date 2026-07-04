const SUPPORTED_CHANNELS = new Set(["telegram", "feishu"]);
const SUPPORTED_STORAGE_PROVIDERS = new Set(["json", "sqlite"]);
const SUPPORTED_FEISHU_DOCUMENT_OUTPUTS = new Set(["feishu_doc", "attachment", "both"]);
const SUPPORTED_ISOLATION_MODES = new Set(["none", "system_user", "container", "microvm", "macos_sandbox", "remote_worker"]);
const REDACTED_SECRET = "[redacted]";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function addError(errors, path, message) {
  errors.push({ path, message });
}

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function validateTelegramConfig(telegram, errors) {
  if (!isPlainObject(telegram)) {
    addError(errors, "channels.telegram", "Telegram config must be an object.");
    return;
  }
  if (telegram.botToken === REDACTED_SECRET) {
    addError(errors, "channels.telegram.botToken", "Redacted Telegram token cannot be persisted.");
  }
  if (!isPlainObject(telegram.private)) {
    addError(errors, "channels.telegram.private", "Telegram private config must be an object.");
  } else if (!isStringArray(telegram.private.allowedChatIds)) {
    addError(errors, "channels.telegram.private.allowedChatIds", "Telegram private allowedChatIds must be a string array.");
  }
  if (!isPlainObject(telegram.groups)) {
    addError(errors, "channels.telegram.groups", "Telegram groups config must be an object.");
  } else {
    if (!isStringArray(telegram.groups.allowedChatIds)) {
      addError(errors, "channels.telegram.groups.allowedChatIds", "Telegram group allowedChatIds must be a string array.");
    }
    if (!isStringArray(telegram.groups.allowedUserIds)) {
      addError(errors, "channels.telegram.groups.allowedUserIds", "Telegram group allowedUserIds must be a string array.");
    }
  }
}

function validateFeishuConfig(feishu, errors) {
  if (!isPlainObject(feishu)) {
    addError(errors, "channels.feishu", "Feishu config must be an object.");
    return;
  }
  if (feishu.appSecret === REDACTED_SECRET) {
    addError(errors, "channels.feishu.appSecret", "Redacted Feishu appSecret cannot be persisted.");
  }
  if (!isStringArray(feishu.botMentionNames)) {
    addError(errors, "channels.feishu.botMentionNames", "Feishu botMentionNames must be a string array.");
  }
  if (feishu.testAudience !== undefined) {
    if (!isPlainObject(feishu.testAudience)) {
      addError(errors, "channels.feishu.testAudience", "Feishu testAudience must be an object.");
    } else {
      if (!isStringArray(feishu.testAudience.userIds)) {
        addError(errors, "channels.feishu.testAudience.userIds", "Feishu testAudience userIds must be a string array.");
      }
      if (!isStringArray(feishu.testAudience.chatIds)) {
        addError(errors, "channels.feishu.testAudience.chatIds", "Feishu testAudience chatIds must be a string array.");
      }
    }
  }
  if (feishu.documentHandling !== undefined) {
    if (!isPlainObject(feishu.documentHandling)) {
      addError(errors, "channels.feishu.documentHandling", "Feishu documentHandling must be an object.");
    } else {
      if (typeof feishu.documentHandling.enabled !== "boolean") {
        addError(errors, "channels.feishu.documentHandling.enabled", "Feishu document handling enabled must be a boolean.");
      }
      if (!SUPPORTED_FEISHU_DOCUMENT_OUTPUTS.has(String(feishu.documentHandling.defaultOutput || "").trim())) {
        addError(errors, "channels.feishu.documentHandling.defaultOutput", "Feishu document output must be feishu_doc, attachment, or both.");
      }
      if (typeof feishu.documentHandling.allowAttachmentInput !== "boolean") {
        addError(errors, "channels.feishu.documentHandling.allowAttachmentInput", "Feishu attachment input must be a boolean.");
      }
      if (typeof feishu.documentHandling.allowCloudDocLinks !== "boolean") {
        addError(errors, "channels.feishu.documentHandling.allowCloudDocLinks", "Feishu cloud doc links must be a boolean.");
      }
    }
  }
  if (feishu.callback !== undefined) {
    if (!isPlainObject(feishu.callback)) {
      addError(errors, "channels.feishu.callback", "Feishu callback config must be an object.");
    } else {
      if (typeof feishu.callback.enabled !== "boolean") {
        addError(errors, "channels.feishu.callback.enabled", "Feishu callback enabled must be a boolean.");
      }
      if (feishu.callback.host !== undefined && typeof feishu.callback.host !== "string") {
        addError(errors, "channels.feishu.callback.host", "Feishu callback host must be a string.");
      }
      if (feishu.callback.path !== undefined && (typeof feishu.callback.path !== "string" || !feishu.callback.path.startsWith("/"))) {
        addError(errors, "channels.feishu.callback.path", "Feishu callback path must start with /.");
      }
      if (feishu.callback.port !== null && feishu.callback.port !== undefined) {
        const port = Number(feishu.callback.port);
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
          addError(errors, "channels.feishu.callback.port", "Feishu callback port must be an integer from 0 to 65535.");
        }
      }
      if (feishu.callback.signingSecret === REDACTED_SECRET) {
        addError(errors, "channels.feishu.callback.signingSecret", "Redacted Feishu callback signingSecret cannot be persisted.");
      }
    }
  }
}

function validateStorageConfig(storage, errors) {
  if (!isPlainObject(storage)) {
    addError(errors, "storage", "Storage config must be an object.");
    return;
  }
  if (!SUPPORTED_STORAGE_PROVIDERS.has(String(storage.provider || "").trim())) {
    addError(errors, "storage.provider", "Storage provider must be json or sqlite.");
  }
}

function validateRuntimeConfig(runtime, errors) {
  if (!isPlainObject(runtime)) {
    addError(errors, "runtime", "Runtime config must be an object.");
    return;
  }
  if (typeof runtime.model !== "string") {
    addError(errors, "runtime.model", "Runtime model must be a string.");
  }
  if (!isPositiveInteger(runtime.maxRunMs)) {
    addError(errors, "runtime.maxRunMs", "Runtime maxRunMs must be a positive integer.");
  }
  if (!isPositiveInteger(runtime.maxOutputBytes)) {
    addError(errors, "runtime.maxOutputBytes", "Runtime maxOutputBytes must be a positive integer.");
  }
  if (!isPlainObject(runtime.isolation)) {
    addError(errors, "runtime.isolation", "Runtime isolation config must be an object.");
    return;
  }
  if (!SUPPORTED_ISOLATION_MODES.has(String(runtime.isolation.mode || "").trim())) {
    addError(errors, "runtime.isolation.mode", "Runtime isolation mode must be none, system_user, container, microvm, macos_sandbox, or remote_worker.");
  }
  if (typeof runtime.isolation.verified !== "boolean") {
    addError(errors, "runtime.isolation.verified", "Runtime isolation verified must be a boolean.");
  }
  if (typeof runtime.isolation.notes !== "string") {
    addError(errors, "runtime.isolation.notes", "Runtime isolation notes must be a string.");
  }
  if (runtime.isolation.lastProbe !== null && runtime.isolation.lastProbe !== undefined) {
    if (!isPlainObject(runtime.isolation.lastProbe)) {
      addError(errors, "runtime.isolation.lastProbe", "Runtime isolation lastProbe must be null or an object.");
    } else {
      if (!new Set(["pass", "fail", "blocked"]).has(String(runtime.isolation.lastProbe.status || "").trim())) {
        addError(errors, "runtime.isolation.lastProbe.status", "Runtime isolation lastProbe status must be pass, fail, or blocked.");
      }
      if (typeof runtime.isolation.lastProbe.checkedAt !== "string") {
        addError(errors, "runtime.isolation.lastProbe.checkedAt", "Runtime isolation lastProbe checkedAt must be a string.");
      }
      if (typeof runtime.isolation.lastProbe.summary !== "string") {
        addError(errors, "runtime.isolation.lastProbe.summary", "Runtime isolation lastProbe summary must be a string.");
      }
    }
  }
}

export function validateBotConfig(config = {}) {
  const errors = [];
  if (!isPlainObject(config)) {
    addError(errors, "", "Bot config must be an object.");
    return errors;
  }
  if (typeof config.id !== "string" || !config.id.trim()) {
    addError(errors, "id", "Bot config id is required.");
  }
  if (!SUPPORTED_CHANNELS.has(String(config.channel || "").trim())) {
    addError(errors, "channel", "Bot config channel must be telegram or feishu.");
  }
  if (typeof config.enabled !== "boolean") {
    addError(errors, "enabled", "Bot config enabled must be a boolean.");
  }
  validateRuntimeConfig(config.runtime, errors);
  validateStorageConfig(config.storage, errors);
  if (!isPlainObject(config.channels)) {
    addError(errors, "channels", "Channels config must be an object.");
  } else {
    validateTelegramConfig(config.channels.telegram, errors);
    validateFeishuConfig(config.channels.feishu, errors);
  }
  return errors;
}

export function assertValidBotConfig(config = {}) {
  const errors = validateBotConfig(config);
  if (errors.length) {
    const details = errors.map((error) => `${error.path || "(root)"}: ${error.message}`).join("; ");
    throw new Error(`Invalid bot config. ${details}`);
  }
  return config;
}
