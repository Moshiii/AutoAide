const KNOWN_COMMANDS = new Set([
  "/start",
  "/help",
  "/where",
  "/credits",
  "/stop",
  "/goal",
  "/schedule",
  "/schedules",
  "/schedule-stop",
  "/schedule-run",
]);

export function parseChannelCommand(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/(?:^|\s)(\/[^\s]+)/);
  return match?.[1] ? String(match[1]).trim().toLowerCase() : null;
}

export function classifyChannelCommand(command) {
  const normalized = String(command || "").trim().toLowerCase();
  if (!normalized.startsWith("/")) {
    return {
      handled: false,
      command: normalized || null,
      action: "agent",
      known: false,
    };
  }
  if (!KNOWN_COMMANDS.has(normalized)) {
    return {
      handled: true,
      command: normalized,
      action: "unsupported",
      known: false,
    };
  }
  return {
    handled: true,
    command: normalized,
    action: normalized.slice(1).replaceAll("-", "_"),
    known: true,
  };
}

export function shouldRouteToAgent(text) {
  const command = parseChannelCommand(text);
  if (!command) {
    return true;
  }
  return !classifyChannelCommand(command).handled;
}

export function createChannelCommandRouter(handlers = {}) {
  return async function routeChannelCommand(context = {}) {
    const command = context.command || parseChannelCommand(context.text);
    const classified = classifyChannelCommand(command);
    if (!classified.handled) {
      return {
        handled: false,
        command,
        action: "agent",
      };
    }

    const handler = handlers[classified.action] || handlers[classified.command] || handlers.unsupported;
    if (typeof handler !== "function") {
      return {
        handled: true,
        command: classified.command,
        action: classified.action,
        result: null,
      };
    }

    const result = await handler({
      ...context,
      command: classified.command,
      action: classified.action,
      known: classified.known,
    });
    return {
      handled: true,
      command: classified.command,
      action: classified.action,
      result,
    };
  };
}

export { KNOWN_COMMANDS };
