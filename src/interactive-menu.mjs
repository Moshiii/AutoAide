import { isCancel, select } from "@clack/prompts";

import { renderCard } from "./ui/banner.mjs";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  primaryBlue: "\x1b[38;5;33m",
  dim: "\x1b[2m",
};

function colorize(text, color) {
  return `${color}${text}${ANSI.reset}`;
}

function normalizeShortcutKey(value) {
  if (value == null) {
    return "";
  }
  return String(value).trim().toLowerCase();
}

function renderShortcutLine(shortcuts) {
  if (!shortcuts.length) {
    return null;
  }
  return shortcuts
    .map((shortcut) => `[${shortcut.key === "space" ? "space" : shortcut.key}] ${shortcut.label}`)
    .join("  ");
}

export function renderSelectionCard(title, items, selectedIndex, options = {}) {
  const headerLines = Array.isArray(options.headerLines) ? options.headerLines.filter(Boolean) : [];
  const numbered = Boolean(options.numbered);
  const lines = [colorize(title, ANSI.bold + ANSI.primaryBlue), ""];
  const bodyLines = Array.isArray(options.bodyLines) ? options.bodyLines.filter(Boolean) : [];
  for (const bodyLine of bodyLines) {
    lines.push(bodyLine);
  }
  if (bodyLines.length) {
    lines.push("");
  }
  for (let index = 0; index < items.length; index += 1) {
    const prefix = numbered
      ? `${index + 1}.`
      : index === selectedIndex ? colorize("›", ANSI.primaryBlue) : " ";
    lines.push(`${prefix} ${items[index].label}`);
  }
  const shortcuts = Array.isArray(options.shortcuts) ? options.shortcuts : [];
  const shortcutLine = renderShortcutLine(shortcuts);
  const hintLines = Array.isArray(options.hintLines) ? options.hintLines.filter(Boolean) : [];
  if (shortcutLine || hintLines.length) {
    lines.push("");
  }
  if (shortcutLine) {
    lines.push(colorize(shortcutLine, ANSI.dim));
  }
  for (const hint of hintLines) {
    lines.push(colorize(hint, ANSI.dim));
  }
  const card = renderCard(lines);
  return [...headerLines, ...(headerLines.length ? [""] : []), ...card].join("\n");
}

export function parseTextMenuResponse(answer, items, options = {}) {
  const shortcuts = Array.isArray(options.shortcuts) ? options.shortcuts : [];
  const defaultIndex = Number.isInteger(options.defaultIndex) ? options.defaultIndex : 0;
  const normalized = String(answer || "").trim().toLowerCase();

  if (!normalized) {
    return {
      action: "select",
      index: defaultIndex,
      value: items[defaultIndex]?.value,
    };
  }

  if (normalized === "q" || normalized === "quit" || normalized === "cancel" || normalized === "esc") {
    return { action: "cancel", index: defaultIndex, value: null };
  }

  const numeric = Number.parseInt(normalized, 10);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= items.length) {
    const index = numeric - 1;
    return {
      action: "select",
      index,
      value: items[index]?.value,
    };
  }

  const matchedShortcut = shortcuts.find((shortcut) => normalizeShortcutKey(shortcut.key) === normalized);
  if (matchedShortcut) {
    return {
      action: "shortcut",
      key: matchedShortcut.key,
      shortcut: matchedShortcut.action,
      index: defaultIndex,
      value: items[defaultIndex]?.value,
    };
  }

  return null;
}

function isReadlineAbortError(error) {
  return error?.code === "ABORT_ERR" || error?.name === "AbortError" || error?.message === "readline was closed";
}

function buildClackOptions(items, shortcuts) {
  const options = items.map((item, index) => ({
    value: `item:${index}`,
    label: item.label,
  }));
  for (let index = 0; index < shortcuts.length; index += 1) {
    const shortcut = shortcuts[index];
    options.push({
      value: `shortcut:${index}`,
      label: shortcut.label,
      hint: shortcut.key === "space" ? "space" : shortcut.key,
    });
  }
  return options;
}

function writeHeaderLines(output, headerLines) {
  if (!headerLines.length) {
    return;
  }
  output.write(`${headerLines.join("\n")}\n\n`);
}

function restoreInput(input) {
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

export async function promptSelect({
  rl,
  input,
  output,
  title,
  items,
  headerLines = [],
  bodyLines = [],
  hintLines = [],
  shortcuts = [],
  defaultIndex = 0,
  fallbackPrompt = "Choose an option: ",
} = {}) {
  if (!Array.isArray(items) || !items.length) {
    return { action: "cancel", index: -1, value: null };
  }

  const safeDefaultIndex = Math.max(0, Math.min(defaultIndex, items.length - 1));
  const safeShortcuts = Array.isArray(shortcuts) ? shortcuts : [];
  const safeBodyLines = Array.isArray(bodyLines) ? bodyLines.filter(Boolean) : [];
  const safeHintLines = Array.isArray(hintLines) ? hintLines.filter(Boolean) : [];
  const safeHeaderLines = Array.isArray(headerLines) ? headerLines.filter(Boolean) : [];

  if (input?.isTTY && output?.isTTY) {
    writeHeaderLines(output, safeHeaderLines);

    try {
      const selected = await select({
        message: title,
        options: buildClackOptions(items, safeShortcuts),
        initialValue: `item:${safeDefaultIndex}`,
        input,
        output,
      });

      if (isCancel(selected)) {
        return { action: "cancel", index: safeDefaultIndex, value: null };
      }

      const [kind, rawIndex] = String(selected).split(":");
      const selectedIndex = Number.parseInt(rawIndex, 10);
      if (kind === "shortcut" && Number.isInteger(selectedIndex) && safeShortcuts[selectedIndex]) {
        const shortcut = safeShortcuts[selectedIndex];
        return {
          action: "shortcut",
          key: shortcut.key,
          shortcut: shortcut.action,
          index: safeDefaultIndex,
          value: items[safeDefaultIndex]?.value,
        };
      }

      if (kind === "item" && Number.isInteger(selectedIndex) && items[selectedIndex]) {
        return {
          action: "select",
          index: selectedIndex,
          value: items[selectedIndex]?.value,
        };
      }
    } finally {
      restoreInput(input);
    }

    return { action: "cancel", index: safeDefaultIndex, value: null };
  }

  if (!input?.isTTY || !output?.isTTY || typeof input.setRawMode !== "function") {
    const frame = renderSelectionCard(title, items, safeDefaultIndex, {
      headerLines: safeHeaderLines,
      bodyLines: safeBodyLines,
      hintLines: safeHintLines,
      shortcuts: safeShortcuts,
      numbered: true,
    });
    output.write(`${frame}\n\n`);
    while (true) {
      let answer;
      try {
        answer = await rl.question(fallbackPrompt);
      } catch (error) {
        if (isReadlineAbortError(error)) {
          return { action: "cancel", index: safeDefaultIndex, value: null };
        }
        throw error;
      }
      const parsed = parseTextMenuResponse(answer, items, {
        shortcuts: safeShortcuts,
        defaultIndex: safeDefaultIndex,
      });
      if (parsed) {
        return parsed;
      }
      output.write("Unknown selection. Try a number, shortcut, or 'q' to cancel.\n");
    }
  }
}
