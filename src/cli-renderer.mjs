import { createLogUpdate } from "log-update";
import * as color from "yoctocolors";

const DEFAULT_WIDTH = 72;
const MAX_STATUS_LENGTH = 80;

function stripAnsi(value) {
  return String(value || "").replace(/\x1b\[[0-9;]*m/g, "");
}

function truncate(value, maxLength = MAX_STATUS_LENGTH) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatElapsed(startedAtMs, nowMs) {
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function padLine(line, width) {
  const plainLength = stripAnsi(line).length;
  return `${line}${" ".repeat(Math.max(0, width - plainLength))}`;
}

function makeBorder(left, fill, right, width) {
  return `${left}${fill.repeat(Math.max(0, width - 2))}${right}`;
}

export function renderRunPanel({
  sessionLabel,
  status,
  elapsed = "00:00",
  width = DEFAULT_WIDTH,
} = {}) {
  const safeWidth = Math.max(42, Number(width) || DEFAULT_WIDTH);
  const title = ` ${sessionLabel || "main"} `;
  const availableTitleFill = Math.max(0, safeWidth - 2 - title.length);
  const leftFill = "─".repeat(Math.floor(availableTitleFill / 2));
  const rightFill = "─".repeat(Math.ceil(availableTitleFill / 2));
  const top = `┌${leftFill}${title}${rightFill}┐`;
  const body = color.bold(truncate(status || "working"));
  const meta = `${color.dim("elapsed")} ${elapsed}`;
  return [
    top,
    `│ ${padLine(body, safeWidth - 4)} │`,
    `│ ${padLine(meta, safeWidth - 4)} │`,
    makeBorder("└", "─", "┘", safeWidth),
  ].join("\n");
}

export function createCliRenderer({
  input = process.stdin,
  output = process.stdout,
  forceInteractive = null,
  now = () => Date.now(),
  intervalMs = 1000,
} = {}) {
  const interactive = forceInteractive ?? Boolean(input?.isTTY && output?.isTTY);
  const logUpdate = interactive ? createLogUpdate(output, { showCursor: true, defaultWidth: DEFAULT_WIDTH }) : null;
  let runState = null;
  let timer = null;

  function write(text = "") {
    output.write(`${text}\n`);
  }

  function clearScreen() {
    if (interactive) {
      output.write("\x1b[2J\x1b[H");
    }
  }

  function render() {
    if (!interactive || !runState) {
      return;
    }
    const elapsed = formatElapsed(runState.startedAtMs, now());
    logUpdate(renderRunPanel({
      sessionLabel: runState.sessionLabel,
      status: runState.status,
      elapsed,
      width: Math.min(output.columns || DEFAULT_WIDTH, DEFAULT_WIDTH),
    }));
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function clearLivePanel() {
    stopTimer();
    if (logUpdate) {
      logUpdate.clear();
    }
  }

  return {
    isInteractive: interactive,

    startRun(sessionLabel) {
      runState = {
        sessionLabel,
        status: "starting",
        startedAtMs: now(),
      };
      if (!interactive) {
        write(`Running on [${sessionLabel}]...`);
        return;
      }
      clearScreen();
      render();
      timer = setInterval(render, intervalMs);
      timer.unref?.();
    },

    updateRunStatus(status) {
      if (!runState) {
        if (!interactive) {
          write(`[status] ${status}`);
        }
        return;
      }
      runState.status = status || runState.status;
      if (!interactive) {
        write(`[status] ${runState.status}`);
        return;
      }
      render();
    },

    finishRun({ ok = true, sessionLabel = null } = {}) {
      const label = sessionLabel || runState?.sessionLabel || "main";
      const elapsed = runState ? formatElapsed(runState.startedAtMs, now()) : "00:00";
      clearLivePanel();
      runState = null;
      const marker = ok ? color.green("✓") : color.red("✕");
      write(`${marker} ${label} ${ok ? "completed" : "failed"} ${color.dim(`in ${elapsed}`)}`);
    },

    cancelRun({ sessionLabel = null } = {}) {
      const label = sessionLabel || runState?.sessionLabel || "main";
      clearLivePanel();
      runState = null;
      write(`${color.yellow("!")} stop requested for ${label}`);
    },

    failRun(message) {
      clearLivePanel();
      runState = null;
      write(`${color.red("✕")} ${message}`);
    },

    sessionBusy(sessionLabel) {
      write(`${color.yellow("!")} ${sessionLabel} is already running ${color.dim("· use /stop first")}`);
    },

    printBlock(text = "") {
      clearLivePanel();
      runState = null;
      output.write(`${String(text).replace(/\n*$/, "")}\n`);
    },

    dispose() {
      clearLivePanel();
      runState = null;
    },
  };
}
