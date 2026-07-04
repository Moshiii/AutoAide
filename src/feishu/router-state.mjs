import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveConversationIdentity } from "../session-routing.mjs";
import { readCliState, writeCliState } from "../config.mjs";

function nowIso() {
  return new Date().toISOString();
}

export function createDefaultFeishuRouterState() {
  return {
    version: 1,
    chats: {},
    processedMessageIds: [],
  };
}

export function normalizeFeishuRouterState(parsed = {}) {
  return {
    version: 1,
    chats: parsed?.chats && typeof parsed.chats === "object" ? parsed.chats : {},
    processedMessageIds: Array.isArray(parsed?.processedMessageIds) ? parsed.processedMessageIds : [],
  };
}

export async function readFeishuRouterState(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return normalizeFeishuRouterState(JSON.parse(raw));
  } catch {
    return createDefaultFeishuRouterState();
  }
}

export async function writeFeishuRouterState(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalizeFeishuRouterState(state), null, 2)}\n`, "utf8");
}

export function ensureFeishuConversationState(state, envelope, options = {}) {
  const { sessionKey, sessionLabel } = resolveConversationIdentity(envelope);
  const now = options.now || nowIso();
  if (!state.chats[sessionKey]) {
    state.chats[sessionKey] = {
      sessionKey,
      cliSessionRef: null,
      sessionLabel,
      createdAt: now,
      updatedAt: now,
    };
  }
  return state.chats[sessionKey];
}

export async function ensureFeishuCliSession(botHome, chatState, deps = {}) {
  const readState = deps.readCliState || readCliState;
  const writeState = deps.writeCliState || writeCliState;
  const now = deps.now || nowIso();
  const cliState = await readState(botHome);
  if (!cliState.sessions[chatState.sessionLabel]) {
    cliState.sessions[chatState.sessionLabel] = {
      label: chatState.sessionLabel,
      cliSessionRef: chatState.cliSessionRef || null,
      createdAt: chatState.createdAt || now,
      updatedAt: now,
    };
  }
  cliState.sessions[chatState.sessionLabel].updatedAt = now;
  if (chatState.cliSessionRef) {
    cliState.sessions[chatState.sessionLabel].cliSessionRef = chatState.cliSessionRef;
  }
  await writeState(cliState, botHome);
  return cliState;
}
