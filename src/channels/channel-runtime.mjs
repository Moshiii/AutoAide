import { createChannelCommandRouter } from "./command-router.mjs";
import { renderRunResultReply, renderTextFallback, renderUnsupportedCommandReply } from "./reply-renderer.mjs";
import { resolveChannelScope } from "./scope-resolver.mjs";
import { createSessionCatalog } from "./session-catalog.mjs";

function normalizeMessageId(envelope = {}) {
  return String(envelope.messageId || envelope.eventId || envelope.id || "").trim();
}

function createMemoryDedupeStore(initial = []) {
  const seen = new Set(initial);
  return {
    has: (id) => seen.has(id),
    add: (id) => seen.add(id),
    snapshot: () => Array.from(seen),
  };
}

function createDefaultCommandHandlers({ sendReply }) {
  return {
    unsupported: async ({ command, envelope }) => {
      const text = renderUnsupportedCommandReply(command);
      await sendReply?.(envelope, text);
      return { text };
    },
  };
}

export function createChannelRuntime(options = {}) {
  const channel = String(options.channel || "").trim();
  if (!channel) {
    throw new Error("ChannelRuntime requires a channel.");
  }
  const dedupe = options.dedupeStore || createMemoryDedupeStore(options.seenMessageIds || []);
  const sessionCatalog = options.sessionCatalog || createSessionCatalog();
  const sendReply = options.sendReply;
  const runMessage = options.runMessage;
  const onEvent = options.onEvent;
  const commandRouter = options.commandRouter || createChannelCommandRouter({
    ...createDefaultCommandHandlers({ sendReply }),
    ...(options.commandHandlers || {}),
  });

  async function handleEnvelope(envelope = {}) {
    const messageId = normalizeMessageId(envelope);
    if (messageId && dedupe.has(messageId)) {
      return {
        status: "duplicate",
        handled: true,
        messageId,
      };
    }
    if (messageId) {
      dedupe.add(messageId);
    }

    const scopedEnvelope = {
      ...envelope,
      channel: envelope.channel || channel,
    };
    const scope = resolveChannelScope(scopedEnvelope);
    const session = sessionCatalog.upsertFromEnvelope(scopedEnvelope);
    onEvent?.({ type: "channel.received", channel, scope, session, envelope: scopedEnvelope });

    const commandResult = await commandRouter({
      envelope: scopedEnvelope,
      scope,
      session,
      text: scopedEnvelope.text || scopedEnvelope.content || "",
    });
    if (commandResult.handled) {
      onEvent?.({ type: "channel.command", channel, scope, session, command: commandResult.command, action: commandResult.action });
      return {
        status: "command",
        handled: true,
        scope,
        session,
        command: commandResult,
      };
    }

    if (typeof runMessage !== "function") {
      const text = renderTextFallback({ title: "No channel runner configured." });
      await sendReply?.(scopedEnvelope, text);
      return {
        status: "no_runner",
        handled: false,
        scope,
        session,
        reply: text,
      };
    }

    const result = await runMessage({
      envelope: scopedEnvelope,
      scope,
      session,
    });
    const text = renderRunResultReply(result);
    if (result?.sendReply !== false) {
      await sendReply?.(scopedEnvelope, text, { result, scope, session });
    }
    if (result?.cliSessionRef || result?.threadRef) {
      sessionCatalog.updateSession(session.sessionKey, {
        cliSessionRef: result.cliSessionRef,
        threadRef: result.threadRef,
      });
    }
    onEvent?.({ type: "channel.run_completed", channel, scope, session, result });
    return {
      status: "run",
      handled: true,
      scope,
      session: sessionCatalog.get(session.sessionKey),
      result,
      reply: text,
    };
  }

  return {
    channel,
    handleEnvelope,
    sessionCatalog,
    dedupe,
  };
}
