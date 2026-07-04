const DEFAULT_MAX_TEXT_LENGTH = 3900;

function normalizeText(value) {
  return String(value || "").trim();
}

export function truncateReplyText(text, options = {}) {
  const maxLength = Number.parseInt(String(options.maxLength ?? DEFAULT_MAX_TEXT_LENGTH), 10);
  const normalizedMax = Number.isFinite(maxLength) && maxLength > 20 ? maxLength : DEFAULT_MAX_TEXT_LENGTH;
  const normalized = normalizeText(text);
  if (normalized.length <= normalizedMax) {
    return normalized;
  }
  const suffix = options.suffix || "\n\n[truncated]";
  return `${normalized.slice(0, Math.max(0, normalizedMax - suffix.length))}${suffix}`;
}

export function renderUnsupportedCommandReply(command) {
  const normalized = normalizeText(command) || "/";
  return `Unsupported command: ${normalized}\nTry /help.`;
}

export function renderRunResultReply(result = {}, options = {}) {
  if (result.stopped) {
    return "Run stopped.";
  }
  if (result.ok === false) {
    return truncateReplyText(result.error || result.output || "Run failed.", options);
  }
  return truncateReplyText(result.output || options.emptyOutputText || "Done. No output.", options);
}

export function renderQueuedReply(queue = {}) {
  const position = Number.parseInt(String(queue.position || 0), 10);
  const label = queue.sessionLabel || queue.routeKey || "this session";
  return position > 0
    ? `Queued for [${label}] at position ${position}.`
    : `Queued for [${label}].`;
}

export function renderBusyReply(scope = {}) {
  const label = scope.sessionLabel || scope.routeKey || "this session";
  return `A request is already running on [${label}].`;
}

export function renderTextFallback(snapshot = {}, options = {}) {
  if (typeof snapshot === "string") {
    return truncateReplyText(snapshot, options);
  }
  if (snapshot.fallbackText) {
    return truncateReplyText(snapshot.fallbackText, options);
  }
  if (snapshot.summary) {
    return truncateReplyText(snapshot.summary, options);
  }
  if (snapshot.title && snapshot.body) {
    return truncateReplyText(`${snapshot.title}\n${snapshot.body}`, options);
  }
  if (snapshot.title) {
    return truncateReplyText(snapshot.title, options);
  }
  return truncateReplyText(options.emptyText || "CodexBridge update.", options);
}
