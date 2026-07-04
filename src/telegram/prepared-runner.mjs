import { createCodexCliAdapter } from "../agents/codex-cli-adapter.mjs";
import { startCliTurn } from "../codex-runner.mjs";
import { settleFailedRunBilling } from "../billing-service.mjs";
import { executeRun } from "../runtime/run-executor.mjs";
import {
  markRunCompleted,
  markRunFailed,
  markRunRunning,
  markRunStopped,
} from "../run-service.mjs";
import { buildWorkspacePrompt } from "../workspace-context.mjs";

function normalizeErrorText(result = {}) {
  return result.stderr || result.output || result.error || "Codex failed.";
}

function renderDefaultCodexResult(result = {}) {
  if (result.ok) {
    if (result.output) {
      return result.output;
    }
    if (result.stderr) {
      return `Codex completed without final text.\n\nstderr:\n${result.stderr}`;
    }
    return "Codex completed, but returned no output.";
  }

  const parts = [`Codex failed${result.exitCode == null ? "" : ` (exit ${result.exitCode})`}.`];
  if (result.output) {
    parts.push(`stdout:\n${result.output}`);
  }
  if (result.stderr) {
    parts.push(`stderr:\n${result.stderr}`);
  }
  return parts.join("\n\n");
}

function renderDefaultInterruptedResult(result = {}) {
  const signalText = result.signal ? ` (${result.signal})` : "";
  return `Codex interrupted${signalText}.`;
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

export async function runPreparedTelegramCodexTurn({
  useRunExecutor = false,
  runRecord,
  chargeResult,
  promptText,
  botHome,
  session,
  routeKey,
  chatId,
  messageId,
  activeLabel,
  envelope = {},
  commandConfig,
  runningJobs,
  logEvent,
  onRunning,
  onSessionRef,
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
  const renderCodexResult = deps.renderCodexResult || renderDefaultCodexResult;
  const renderInterruptedResult = deps.renderInterruptedResult || renderDefaultInterruptedResult;

  if (!runRecord?.runId) {
    throw new Error("Telegram prepared runner requires runRecord.runId.");
  }

  const registerJob = (job) => {
    runningJobs?.set(routeKey, job);
  };
  const unregisterJob = (job) => {
    if (runningJobs?.get(routeKey) === job) {
      runningJobs.delete(routeKey);
    }
  };

  if (useRunExecutor) {
    const job = {
      child: null,
      stopRequested: false,
      startedAt: new Date().toISOString(),
    };
    registerJob(job);

    try {
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
          sessionRef: session?.cliSessionRef || null,
          sessionKey: routeKey,
          onChild: (child) => {
            job.child = child;
          },
        },
        onRunning: async (queuedRun) => {
          await onRunning?.(queuedRun, job);
        },
      }, {
        agentAdapter: adapter,
        settleFailedRunBilling: settleBilling,
      });
      unregisterJob(job);

      if (execution.result.ok && execution.result.cliSessionRef) {
        await onSessionRef?.(execution.result.cliSessionRef);
      }

      const messageText = execution.result.stopped
        ? renderInterruptedResult({
          signal: execution.result.signal,
        })
        : renderCodexResult({
          ok: execution.result.ok,
          output: execution.result.output,
          stderr: execution.result.error,
          exitCode: execution.result.exitCode,
          signal: execution.result.signal,
        });

      return {
        ok: execution.result.ok,
        stopped: Boolean(execution.result.stopped),
        cliSessionRef: execution.result.cliSessionRef || null,
        messageText,
        errorText: normalizeErrorText(execution.result),
        run: execution.run,
        events: execution.events,
        job,
      };
    } catch (error) {
      unregisterJob(job);
      await markFailed(runRecord.runId, error, {}, botHome).catch(() => {});
      await settleFailedBillingSafely(settleBilling, {
        userId: runRecord.userId,
        chargeResult,
        failureType: "start_failed",
        botHome,
        channel: envelope.channel,
        chatType: envelope.chatType,
        chatId,
        messageId,
        runId: runRecord.runId,
      });
      return {
        ok: false,
        stopped: false,
        cliSessionRef: null,
        messageText: "",
        errorText: String(error?.message || error || "Codex failed."),
        run: null,
        events: [],
        job,
      };
    }
  }

  await markRunning(runRecord.runId, {
    costSource: chargeResult?.costSource,
    creditsCharged: chargeResult?.charged,
  }, botHome);
  await onRunning?.(runRecord, null);

  const prompt = await buildPrompt(promptText, { botHome });
  const started = startTurn(prompt, session?.cliSessionRef || null, commandConfig);
  const job = {
    child: started.child,
    stopRequested: false,
    startedAt: new Date().toISOString(),
  };
  registerJob(job);

  try {
    const result = await started.result;
    unregisterJob(job);

    if (result.ok && result.cliSessionRef) {
      await onSessionRef?.(result.cliSessionRef);
    }

    const messageText = job.stopRequested && !result.ok
      ? renderInterruptedResult(result)
      : renderCodexResult(result);

    if (result.ok) {
      await markCompleted(runRecord.runId, {
        codexThreadId: result.cliSessionRef || "",
        output: messageText,
      }, botHome);
    } else if (job.stopRequested) {
      await markStopped(runRecord.runId, "user_stop", {
        codexThreadId: result.cliSessionRef || "",
        outputPreview: typeof messageText === "string" ? messageText.slice(0, 500) : "",
        error: normalizeErrorText(result),
      }, botHome);
    } else {
      await markFailed(runRecord.runId, normalizeErrorText(result), {
        codexThreadId: result.cliSessionRef || "",
        outputPreview: typeof messageText === "string" ? messageText.slice(0, 500) : "",
      }, botHome);
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
      ok: result.ok,
      stopped: Boolean(job.stopRequested),
      cliSessionRef: result.cliSessionRef || null,
      messageText,
      errorText: normalizeErrorText(result),
      run: null,
      events: [],
      job,
    };
  } catch (error) {
    unregisterJob(job);
    await markFailed(runRecord.runId, error, {}, botHome).catch(() => {});
    await settleFailedBillingSafely(settleBilling, {
      userId: runRecord.userId,
      chargeResult,
      failureType: "start_failed",
      botHome,
      channel: envelope.channel,
      chatType: envelope.chatType,
      chatId,
      messageId,
      runId: runRecord.runId,
    });
    return {
      ok: false,
      stopped: false,
      cliSessionRef: null,
      messageText: "",
      errorText: String(error?.message || error || "Codex failed."),
      run: null,
      events: [],
      job,
    };
  }
}
