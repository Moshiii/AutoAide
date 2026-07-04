import { startCliTurn } from "../codex-runner.mjs";
import { normalizeAgentRequest, normalizeAgentResult } from "./types.mjs";

export function createCodexCliAdapter(commandConfig = {}) {
  return {
    async runTurn(request = {}, handlers = {}) {
      const normalizedRequest = normalizeAgentRequest(request);
      const started = startCliTurn(normalizedRequest.prompt || "", normalizedRequest.sessionRef || null, {
        ...commandConfig,
        onStatus: normalizedRequest.onStatus || commandConfig.onStatus,
        onAgentEvent: (event, rawEvent) => {
          handlers.onEvent?.(event, rawEvent);
          normalizedRequest.onAgentEvent?.(event, rawEvent);
          commandConfig.onAgentEvent?.(event, rawEvent);
        },
        agentEventContext: {
          ...(commandConfig.agentEventContext || {}),
          ...(normalizedRequest.agentEventContext || {}),
          runId: normalizedRequest.runId || normalizedRequest.agentEventContext?.runId || commandConfig.agentEventContext?.runId,
          sessionKey: normalizedRequest.sessionKey || normalizedRequest.agentEventContext?.sessionKey || commandConfig.agentEventContext?.sessionKey,
          provider: normalizedRequest.provider || commandConfig.agentEventContext?.provider,
        },
      });
      normalizedRequest.onChild?.(started.child);
      return normalizeAgentResult(await started.result);
    },
  };
}
