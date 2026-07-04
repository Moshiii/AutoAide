import { AgentEventType } from "../agents/events.mjs";
import {
  FEISHU_CARD_STATE,
  createFeishuCardAction,
  createFeishuCardButton,
  createFeishuTextElement,
  getFeishuCardStateMeta,
} from "./cards.mjs";

const MAX_CARD_TEXT = 1800;
const MAX_EVENT_LINES = 6;

export function truncateFeishuCardText(text, maxLength = MAX_CARD_TEXT) {
  const normalized = String(text || "").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 16))}\n...(truncated)`;
}

export function mapAgentEventToFeishuCardState(event) {
  switch (event?.type) {
    case AgentEventType.SESSION_STARTED:
      return FEISHU_CARD_STATE.RUNNING;
    case AgentEventType.THINKING_STARTED:
      return FEISHU_CARD_STATE.THINKING;
    case AgentEventType.TOOL_STARTED:
    case AgentEventType.COMMAND_STARTED:
      return FEISHU_CARD_STATE.USING_TOOL;
    case AgentEventType.MESSAGE_COMPLETED:
      return FEISHU_CARD_STATE.COMPLETED;
    case "permission.requested":
      return FEISHU_CARD_STATE.WAITING_PERMISSION;
    case "question.requested":
      return FEISHU_CARD_STATE.WAITING_ANSWER;
    case "run.failed":
      return FEISHU_CARD_STATE.FAILED;
    case "run.stopped":
      return FEISHU_CARD_STATE.STOPPED;
    default:
      return FEISHU_CARD_STATE.RUNNING;
  }
}

export function summarizeFeishuCardEvent(event) {
  if (!event) {
    return "";
  }
  if (event.payload?.summary) {
    return event.payload.summary;
  }
  if (event.type === AgentEventType.MESSAGE_COMPLETED) {
    return "Final answer ready.";
  }
  if (event.type === "permission.requested") {
    return event.payload?.summary || "Approval requested.";
  }
  if (event.type === "question.requested") {
    return event.payload?.summary || "User input requested.";
  }
  if (event.type === "run.failed") {
    return event.payload?.errorText || "Run failed.";
  }
  if (event.type === "run.stopped") {
    return "Run stopped.";
  }
  return event.type || "status";
}

export function renderFeishuRunCard({
  state = FEISHU_CARD_STATE.RUNNING,
  title = "CodexBridge",
  sessionLabel,
  summary,
  outputText,
  errorText,
  events = [],
  permission,
  question,
} = {}) {
  const meta = getFeishuCardStateMeta(state);
  const elements = [
    createFeishuTextElement(`**Status:** ${meta.label}`),
  ];

  if (sessionLabel) {
    elements.push(createFeishuTextElement(`**Session:** ${escapeFeishuMarkdown(sessionLabel)}`));
  }
  if (summary) {
    elements.push(createFeishuTextElement(truncateFeishuCardText(summary)));
  }

  const recentEvents = events
    .map((event) => summarizeFeishuCardEvent(event))
    .filter(Boolean)
    .slice(-MAX_EVENT_LINES);
  if (recentEvents.length > 0) {
    elements.push(createFeishuTextElement(recentEvents.map((line) => `- ${truncateFeishuCardText(line, 240)}`).join("\n")));
  }

  if (outputText) {
    elements.push(createFeishuTextElement(`**Result**\n${truncateFeishuCardText(outputText)}`));
  }
  if (errorText) {
    elements.push(createFeishuTextElement(`**Error**\n${truncateFeishuCardText(errorText)}`));
  }
  if (permission) {
    elements.push(createFeishuTextElement(`**Approval required**\n${truncateFeishuCardText(permission.summary || permission.actionId || "Review this action.")}`));
    elements.push(createFeishuCardAction([
      createFeishuCardButton({
        text: "Approve",
        type: "primary",
        value: createPermissionActionValue(permission, "permission.allow"),
      }),
      createFeishuCardButton({
        text: "Deny",
        type: "danger",
        value: createPermissionActionValue(permission, "permission.deny"),
      }),
    ]));
  }
  if (question) {
    elements.push(createFeishuTextElement(`**Question**\n${truncateFeishuCardText(question.prompt || question.summary || "Reply with more details.")}`));
  }

  return {
    config: {
      wide_screen_mode: true,
      update_multi: true,
    },
    header: {
      template: meta.template,
      title: {
        tag: "plain_text",
        content: title,
      },
    },
    elements,
  };
}

export function renderFeishuCardForAgentEvent(event, context = {}) {
  const state = context.state || mapAgentEventToFeishuCardState(event);
  return renderFeishuRunCard({
    ...context,
    state,
    summary: context.summary || summarizeFeishuCardEvent(event),
    outputText: context.outputText || event?.payload?.text,
    errorText: context.errorText || event?.payload?.errorText,
    events: context.events || [event],
    permission: context.permission || event?.payload?.permission,
    question: context.question || event?.payload?.question,
  });
}

function escapeFeishuMarkdown(text) {
  return String(text || "").replace(/\*/g, "\\*").replace(/_/g, "\\_");
}

function createPermissionActionValue(permission, action) {
  return {
    action,
    channel: permission.channel || "feishu",
    runId: permission.runId,
    actionId: permission.actionId,
    userId: permission.userId,
    nonce: permission.nonce,
    createdAt: permission.createdAt,
    expiresAt: permission.expiresAt,
    payloadHash: permission.payloadHash || permission.actionHash,
    signature: permission.signature,
  };
}
