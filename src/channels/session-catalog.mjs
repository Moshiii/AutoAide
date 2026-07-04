import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveChannelScope } from "./scope-resolver.mjs";

function nowIso() {
  return new Date().toISOString();
}

function normalizeString(value) {
  return String(value || "").trim();
}

function ensureSessionKey(value) {
  const sessionKey = normalizeString(value);
  if (!sessionKey) {
    throw new Error("SessionCatalog requires a non-empty session key.");
  }
  return sessionKey;
}

function createSessionRecord(scope = {}, previous = {}, options = {}) {
  const now = options.now || nowIso();
  const sessionKey = ensureSessionKey(scope.sessionKey || previous.sessionKey);
  return {
    sessionKey,
    sessionLabel: normalizeString(scope.sessionLabel || previous.sessionLabel || sessionKey),
    channel: normalizeString(scope.channel || previous.channel),
    chatType: normalizeString(scope.chatType || previous.chatType),
    chatId: normalizeString(scope.chatId || previous.chatId),
    userId: normalizeString(scope.userId || previous.userId),
    isDirect: Boolean(scope.isDirect ?? previous.isDirect),
    isGroup: Boolean(scope.isGroup ?? previous.isGroup),
    cliSessionRef: options.cliSessionRef ?? previous.cliSessionRef ?? null,
    threadRef: options.threadRef ?? previous.threadRef ?? null,
    createdAt: previous.createdAt || now,
    updatedAt: now,
    metadata: {
      ...(previous.metadata || {}),
      ...(options.metadata || {}),
    },
  };
}

export function normalizeSessionCatalogState(state = {}) {
  const sessions = state?.sessions && typeof state.sessions === "object" ? state.sessions : {};
  return {
    version: 1,
    sessions: Object.fromEntries(
      Object.entries(sessions).map(([key, session]) => {
        const sessionKey = normalizeString(session?.sessionKey || key);
        return [sessionKey, createSessionRecord({ ...session, sessionKey }, session, {
          now: session?.updatedAt || session?.createdAt || nowIso(),
          cliSessionRef: session?.cliSessionRef ?? null,
          threadRef: session?.threadRef ?? null,
          metadata: session?.metadata || {},
        })];
      }),
    ),
  };
}

export function createSessionCatalog(initialState = {}, options = {}) {
  const state = normalizeSessionCatalogState(initialState);
  const clock = options.now || nowIso;

  function upsertFromEnvelope(envelope = {}, upsertOptions = {}) {
    const scope = resolveChannelScope(envelope);
    const previous = state.sessions[scope.sessionKey] || {};
    const record = createSessionRecord(scope, previous, {
      ...upsertOptions,
      now: upsertOptions.now || clock(),
    });
    state.sessions[record.sessionKey] = record;
    return record;
  }

  function updateSession(sessionKey, patch = {}) {
    const key = ensureSessionKey(sessionKey);
    const previous = state.sessions[key];
    if (!previous) {
      return null;
    }
    const record = createSessionRecord({
      ...previous,
      ...patch,
      sessionKey: key,
    }, previous, {
      cliSessionRef: patch.cliSessionRef ?? previous.cliSessionRef ?? null,
      threadRef: patch.threadRef ?? previous.threadRef ?? null,
      metadata: patch.metadata || {},
      now: patch.updatedAt || clock(),
    });
    state.sessions[key] = record;
    return record;
  }

  function get(sessionKey) {
    return state.sessions[ensureSessionKey(sessionKey)] || null;
  }

  function findByLabel(sessionLabel) {
    const label = normalizeString(sessionLabel);
    if (!label) {
      return null;
    }
    return Object.values(state.sessions).find((session) => session.sessionLabel === label) || null;
  }

  function list(filter = {}) {
    return Object.values(state.sessions)
      .filter((session) => !filter.channel || session.channel === filter.channel)
      .filter((session) => !filter.chatId || session.chatId === filter.chatId)
      .filter((session) => !filter.userId || session.userId === filter.userId)
      .sort((a, b) => a.sessionKey.localeCompare(b.sessionKey));
  }

  function snapshot() {
    return normalizeSessionCatalogState(state);
  }

  return {
    upsertFromEnvelope,
    updateSession,
    get,
    findByLabel,
    list,
    snapshot,
  };
}

export async function readSessionCatalogState(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return normalizeSessionCatalogState(JSON.parse(raw));
  } catch {
    return normalizeSessionCatalogState();
  }
}

export async function writeSessionCatalogState(filePath, state = {}) {
  const normalized = normalizeSessionCatalogState(state);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export async function readSessionCatalog(filePath, options = {}) {
  return createSessionCatalog(await readSessionCatalogState(filePath), options);
}
