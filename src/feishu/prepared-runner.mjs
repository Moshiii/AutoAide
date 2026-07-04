import { createCodexCliAdapter } from "../agents/codex-cli-adapter.mjs";
import { startCliTurn } from "../codex-runner.mjs";
import { executeRun } from "../runtime/run-executor.mjs";
import {
  markRunCompleted,
  markRunFailed,
  markRunRunning,
  markRunStopped,
} from "../run-service.mjs";
import { settleFailedRunBilling } from "../billing-service.mjs";
import { buildWorkspacePrompt } from "../workspace-context.mjs";

function normalizeErrorText(result = {}) {
  return result.stderr || result.output || result.error || "Unknown error.";
}

function normalizeOutputText(result = {}) {
  return result.output || "Done.";
}

async function settleFailedBillingSafely(settleBilling, payload) {
  try {
    return await settleBilling(payload);
  } catch (error) {
    return {
      ok: false,
      refunded: 0,
      skipped: true,
      reason: "settlement_failed",
      error: String(error?.message || error || "Unknown billing settlement error."),
    };
  }
}

export async function runPreparedFeishuCodexTurn({
  useRunExecutor = false,
  runRecord,
  chargeResult,
  promptText,
  botHome,
  chatState,
  routeKey,
  commandConfig,
  activeRuns,
  envelope = {},
  chatId = "",
  messageId = "",
  onRunning,
  permissionBroker,
  questionBroker,
  logEvent,
  deps = {},
} = {}) {
  const buildPrompt = deps.buildWorkspacePrompt || buildWorkspacePrompt;
  const startTurn = deps.startCliTurn || startCliTurn;
  const markRunning = deps.markRunRunning || markRunRunning;
  const markCompleted = deps.markRunCompleted || markRunCompleted;
  const markFailed = deps.markRunFailed || markRunFailed;
  const markStopped = deps.markRunStopped || markRunStopped;
  const settleBilling = deps.settleFailedRunBilling || settleFailedRunBilling;
  const execute = deps.executeRun || executeRun;
  const createAdapter = deps.createCodexCliAdapter || createCodexCliAdapter;

  if (!runRecord?.runId) {
    throw new Error("Feishu prepared runner requires runRecord.runId.");
  }

  if (useRunExecutor) {
    const prompt = await buildPrompt(promptText, { botHome });
    const adapter = deps.agentAdapter || createAdapter(commandConfig);
    const execution = await execute({
      run: runRecord,
      agentProvider: "codex-cli",
      botHome,
      logEvent,
      runningPatch: {
        costSource: chargeResult?.costSource,
        creditsCharged: chargeResult?.charged,
      },
      billing: {
        userId: runRecord.userId,
        chargeResult,
        channel: envelope.channel,
        chatType: envelope.chatType,
        chatId,
        messageId,
      },
      agentRequest: {
        prompt,
        sessionRef: chatState?.cliSessionRef || null,
        sessionKey: routeKey,
        onChild: (child) => {
          activeRuns?.set(routeKey, child);
        },
      },
      onRunning,
      permissionBroker,
      questionBroker,
    }, {
      agentAdapter: adapter,
      settleFailedRunBilling: settleBilling,
    });
    activeRuns?.delete(routeKey);
    return {
      ok: execution.result.ok,
      stopped: Boolean(execution.result.stopped),
      cliSessionRef: execution.result.cliSessionRef,
      outputText: normalizeOutputText(execution.result),
      errorText: normalizeErrorText(execution.result),
      run: execution.run,
      events: execution.events,
    };
  }

  await markRunning(runRecord.runId, {
    costSource: chargeResult?.costSource,
    creditsCharged: chargeResult?.charged,
  }, botHome);
  await onRunning?.(runRecord);

  const prompt = await buildPrompt(promptText, { botHome });
  const started = startTurn(prompt, chatState?.cliSessionRef || null, commandConfig);
  activeRuns?.set(routeKey, started.child);

  const result = await started.result;
  activeRuns?.delete(routeKey);

  if (!result.ok) {
    if (result.stopped) {
      await markStopped(runRecord.runId, "user_stop", {
        error: normalizeErrorText(result),
      }, botHome);
    } else {
      await markFailed(runRecord.runId, normalizeErrorText(result), {}, botHome);
      await settleFailedBillingSafely(settleBilling, {
        userId: runRecord.userId,
        chargeResult,
        failureType: "failed",
        botHome,
        channel: envelope.channel,
        chatType: envelope.chatType,
        chatId,
        messageId,
        runId: runRecord.runId,
      });
    }
    return {
      ok: false,
      stopped: Boolean(result.stopped),
      cliSessionRef: result.cliSessionRef || null,
      outputText: normalizeOutputText(result),
      errorText: normalizeErrorText(result),
      run: null,
      events: [],
    };
  }

  await markCompleted(runRecord.runId, {
    codexThreadId: result.cliSessionRef || null,
    output: normalizeOutputText(result),
  }, botHome);
  return {
    ok: true,
    stopped: false,
    cliSessionRef: result.cliSessionRef || null,
    outputText: normalizeOutputText(result),
    errorText: "",
    run: null,
    events: [],
  };
}
