import { stdout } from "node:process";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  primaryBlue: "\x1b[38;5;33m",
};

export const STARTUP_LOGO_LINES = [
  " ██████╗ ██████╗ ██████╗ ███████╗██╗  ██╗       ",
  "██╔════╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝       ",
  "██║     ██║   ██║██║  ██║█████╗   ╚███╔╝        ",
  "██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗        ",
  "╚██████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗       ",
  " ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝       ",
  "██████╗ ██████╗ ██╗██████╗  ██████╗ ███████╗    ",
  "██╔══██╗██╔══██╗██║██╔══██╗██╔════╝ ██╔════╝    ",
  "██████╔╝██████╔╝██║██║  ██║██║  ███╗█████╗      ",
  "██╔══██╗██╔══██╗██║██║  ██║██║   ██║██╔══╝      ",
  "██████╔╝██║  ██║██║██████╔╝╚██████╔╝███████╗    ",
  "╚═════╝ ╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝ ╚══════╝    ",
];
function colorize(text, color) {
  return `${color}${text}${ANSI.reset}`;
}

function padAnsi(text, width) {
  const plainLength = stripAnsi(text).length;
  return `${text}${" ".repeat(Math.max(0, width - plainLength))}`;
}

export function stripAnsi(text) {
  return String(text || "").replace(/\x1b\[[0-9;]*m/g, "");
}

export function countRenderedRows(lines, columns = stdout.columns || 80) {
  const safeColumns = Math.max(1, Number(columns) || 80);
  return lines.reduce((total, line) => {
    const plain = stripAnsi(line);
    // Terminals may auto-wrap when a line exactly fills the viewport width.
    // Count with a +1 sentinel so full-width border lines do not under-clear.
    return total + Math.max(1, Math.ceil((plain.length + 1) / safeColumns));
  }, 0);
}

export function renderCard(lines) {
  const plainLines = lines.map((line) => stripAnsi(line));
  const innerWidth = Math.max(...plainLines.map((line) => line.length));
  const top = `╭${"─".repeat(innerWidth + 2)}╮`;
  const bottom = `╰${"─".repeat(innerWidth + 2)}╯`;
  const body = lines.map((line, index) => {
    const pad = " ".repeat(innerWidth - plainLines[index].length);
    return `│ ${line}${pad} │`;
  });
  return [top, ...body, bottom];
}

export function formatKeyValueCard(title, rows) {
  const lines = [colorize(title, ANSI.bold + ANSI.primaryBlue), ""];
  for (const [label, value] of rows) {
    lines.push(`${colorize(`${label}:`, ANSI.primaryBlue)} ${value}`);
  }
  return renderCard(lines).join("\n");
}

export function formatKeyValueGridCard(title, rows, { columns = 2 } = {}) {
  const normalizedRows = rows.map((row) => {
    if (Array.isArray(row)) {
      return { label: row[0], value: row[1], span: false };
    }
    return {
      label: row.label,
      value: row.value,
      span: row.span === "full",
    };
  });
  const labelWidth = Math.max(...normalizedRows.map((row) => String(row.label).length));
  const cells = normalizedRows
    .filter((row) => !row.span)
    .map((row) => `${colorize(`${String(row.label).padEnd(labelWidth)}:`, ANSI.primaryBlue)} ${row.value}`);
  const cellWidth = Math.max(...cells.map((cell) => stripAnsi(cell).length), 1);
  const lines = [colorize(title, ANSI.bold + ANSI.primaryBlue), ""];
  let pending = [];

  function flushPending() {
    if (!pending.length) {
      return;
    }
    lines.push(pending.map((cell) => padAnsi(cell, cellWidth)).join("   "));
    pending = [];
  }

  for (const row of normalizedRows) {
    const cell = `${colorize(`${String(row.label).padEnd(labelWidth)}:`, ANSI.primaryBlue)} ${row.value}`;
    if (row.span) {
      flushPending();
      lines.push(cell);
      continue;
    }
    pending.push(cell);
    if (pending.length === columns) {
      flushPending();
    }
  }
  flushPending();
  return renderCard(lines).join("\n");
}

export function formatListCard(title, items) {
  const lines = [colorize(title, ANSI.bold + ANSI.primaryBlue), "", ...items];
  return renderCard(lines).join("\n");
}

export function formatMessageCard(title, bodyLines) {
  return renderCard([colorize(title, ANSI.bold + ANSI.primaryBlue), "", ...bodyLines]).join("\n");
}

export function composeStartupBanner(frame = STARTUP_LOGO_LINES) {
  return frame.map((line) => colorize(line, ANSI.primaryBlue));
}

export function composeInteractiveHeader({ botId = "default", model = "gpt-5.4" } = {}) {
  return [
    `${colorize("CodexBridge", ANSI.bold + ANSI.primaryBlue)} ${colorize(`· ${botId} · ${model}`, ANSI.dim)}`,
  ];
}

function printLines(lines) {
  stdout.write(`${lines.join("\n")}\n`);
}

export async function showStartupBanner() {
  printLines(composeStartupBanner());
  stdout.write("\n");
}
