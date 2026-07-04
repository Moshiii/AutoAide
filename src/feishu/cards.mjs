export const FEISHU_CARD_STATE = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  THINKING: "thinking",
  USING_TOOL: "using_tool",
  WAITING_PERMISSION: "waiting_permission",
  WAITING_ANSWER: "waiting_answer",
  COMPLETED: "completed",
  FAILED: "failed",
  STOPPED: "stopped",
});

const STATE_META = Object.freeze({
  queued: { label: "Queued", template: "blue" },
  running: { label: "Running", template: "blue" },
  thinking: { label: "Thinking", template: "blue" },
  using_tool: { label: "Using tool", template: "wathet" },
  waiting_permission: { label: "Waiting for approval", template: "orange" },
  waiting_answer: { label: "Waiting for reply", template: "orange" },
  completed: { label: "Completed", template: "green" },
  failed: { label: "Failed", template: "red" },
  stopped: { label: "Stopped", template: "grey" },
});

export function getFeishuCardStateMeta(state) {
  return STATE_META[state] || STATE_META.running;
}

export function createFeishuTextElement(content) {
  return {
    tag: "markdown",
    content,
  };
}

export function createFeishuCardButton({ text, value, type = "default" }) {
  return {
    tag: "button",
    text: {
      tag: "plain_text",
      content: text,
    },
    type,
    value,
  };
}

export function createFeishuCardAction(elements) {
  return {
    tag: "action",
    actions: elements,
  };
}
