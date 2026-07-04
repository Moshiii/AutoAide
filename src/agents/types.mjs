function normalizeString(value) {
  return String(value || "").trim();
}

export function normalizeAgentRequest(request = {}) {
  const prompt = String(request.prompt ?? request.input ?? "");
  return {
    ...request,
    prompt,
    sessionRef: request.sessionRef || request.cliSessionRef || request.codexThreadId || null,
    runId: normalizeString(request.runId),
    sessionKey: normalizeString(request.sessionKey),
    provider: normalizeString(request.provider || request.agentProvider || "codex-cli"),
    metadata: {
      ...(request.metadata || {}),
    },
  };
}

export function normalizeAgentResult(result = {}) {
  const ok = result.ok !== false;
  const stopped = Boolean(result.stopped);
  const output = String(result.output ?? result.stdout ?? "");
  const error = String(result.error ?? result.stderr ?? "");
  const cliSessionRef = result.cliSessionRef || result.codexThreadId || result.threadRef || null;
  return {
    ...result,
    ok,
    stopped,
    output,
    error,
    cliSessionRef,
    codexThreadId: result.codexThreadId || cliSessionRef,
    provider: normalizeString(result.provider || result.agentProvider || "codex-cli"),
  };
}

export function assertAgentAdapter(adapter, provider = "agent") {
  if (!adapter || typeof adapter.runTurn !== "function") {
    throw new Error(`Agent adapter '${provider}' must expose runTurn(request, handlers).`);
  }
  return adapter;
}
