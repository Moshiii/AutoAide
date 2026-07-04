export const AgentEventType = Object.freeze({
  SESSION_STARTED: "session.started",
  STATUS: "status",
  THINKING_STARTED: "thinking.started",
  TOOL_STARTED: "tool.started",
  TOOL_COMPLETED: "tool.completed",
  COMMAND_STARTED: "command.started",
  COMMAND_COMPLETED: "command.completed",
  MESSAGE_COMPLETED: "message.completed",
  RAW: "raw",
});

function nowIso() {
  return new Date().toISOString();
}

function createAgentEvent(type, rawEvent, payload = {}, context = {}) {
  return {
    id: context.id || rawEvent?.id || rawEvent?.item?.id || null,
    type,
    runId: context.runId || null,
    sessionKey: context.sessionKey || null,
    createdAt: context.createdAt || nowIso(),
    provider: context.provider || "codex-cli",
    payload: {
      ...payload,
      raw: rawEvent ?? null,
    },
  };
}

function extractToolLabel(item) {
  return (
    item?.name ||
    item?.tool_name ||
    item?.toolName ||
    item?.raw_item?.name ||
    item?.call_name ||
    item?.action?.name ||
    "tool"
  );
}

function compactCommand(command) {
  if (typeof command !== "string") {
    return "command";
  }

  const trimmed = command.trim();
  if (!trimmed) {
    return "command";
  }

  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
}

export function summarizeCodexCliEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  if (event.type === "thread.started") {
    return "Session started";
  }

  if (event.type === "item.started" && event.item?.type === "tool_call") {
    return `Using ${extractToolLabel(event.item)}...`;
  }

  if (event.type === "item.completed" && event.item?.type === "tool_call") {
    return `Finished ${extractToolLabel(event.item)}.`;
  }

  if (event.type === "item.started" && event.item?.type === "command_execution") {
    return `Running ${compactCommand(event.item.command)}...`;
  }

  if (event.type === "item.completed" && event.item?.type === "command_execution") {
    return `Finished ${compactCommand(event.item.command)}.`;
  }

  if (event.type === "item.started" && event.item?.type === "reasoning") {
    return "Thinking...";
  }

  return null;
}

export function normalizeCodexCliEvent(event, context = {}) {
  if (!event || typeof event !== "object") {
    return null;
  }

  if (event.type === "thread.started") {
    return createAgentEvent(AgentEventType.SESSION_STARTED, event, {
      cliSessionRef: event.thread_id || null,
      summary: "Session started",
    }, context);
  }

  if (event.type === "item.started" && event.item?.type === "tool_call") {
    const label = extractToolLabel(event.item);
    return createAgentEvent(AgentEventType.TOOL_STARTED, event, {
      label,
      summary: `Using ${label}...`,
    }, context);
  }

  if (event.type === "item.completed" && event.item?.type === "tool_call") {
    const label = extractToolLabel(event.item);
    return createAgentEvent(AgentEventType.TOOL_COMPLETED, event, {
      label,
      summary: `Finished ${label}.`,
    }, context);
  }

  if (event.type === "item.started" && event.item?.type === "command_execution") {
    const command = event.item.command || "";
    return createAgentEvent(AgentEventType.COMMAND_STARTED, event, {
      command,
      summary: `Running ${compactCommand(command)}...`,
    }, context);
  }

  if (event.type === "item.completed" && event.item?.type === "command_execution") {
    const command = event.item.command || "";
    return createAgentEvent(AgentEventType.COMMAND_COMPLETED, event, {
      command,
      summary: `Finished ${compactCommand(command)}.`,
    }, context);
  }

  if (event.type === "item.started" && event.item?.type === "reasoning") {
    return createAgentEvent(AgentEventType.THINKING_STARTED, event, {
      summary: "Thinking...",
    }, context);
  }

  if (event.type === "item.completed" && event.item?.type === "agent_message") {
    return createAgentEvent(AgentEventType.MESSAGE_COMPLETED, event, {
      text: typeof event.item.text === "string" ? event.item.text : "",
    }, context);
  }

  return createAgentEvent(AgentEventType.RAW, event, {}, context);
}

export function parseCodexCliEventLine(line, context = {}) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    return normalizeCodexCliEvent(JSON.parse(trimmed), context);
  } catch {
    return null;
  }
}
