import { normalizeAgentRequest, normalizeAgentResult } from "./types.mjs";

export function createCodexSdkAdapter(options = {}) {
  const runTurn = options.runTurn;
  return {
    experimental: true,
    async runTurn(request = {}, handlers = {}) {
      const normalizedRequest = normalizeAgentRequest({
        ...request,
        provider: request.provider || "codex-sdk",
      });
      if (typeof runTurn !== "function") {
        throw new Error("Codex SDK adapter is experimental and requires an injected runTurn implementation.");
      }
      handlers.onEvent?.({
        id: `${normalizedRequest.runId || "run"}:sdk-started`,
        type: "run.started",
        runId: normalizedRequest.runId,
        sessionKey: normalizedRequest.sessionKey,
        createdAt: new Date().toISOString(),
        provider: normalizedRequest.provider,
        payload: {
          experimental: true,
        },
      });
      return normalizeAgentResult({
        provider: normalizedRequest.provider,
        ...await runTurn(normalizedRequest, handlers),
      });
    },
  };
}
