import {
  createQueuedRun,
  markRunCompleted,
  markRunFailed,
  markRunRunning,
  markRunStopped,
} from "../run-service.mjs";
import { settleFailedRunBilling } from "../billing-service.mjs";
import { appendRuntimeAuditEvent } from "../runtime-audit-log.mjs";
import { readMigrationFeatureFlags } from "./feature-flags.mjs";

function createDefaultRunServices() {
  return {
    createQueuedRun,
    markRunRunning,
    markRunCompleted,
    markRunFailed,
    markRunStopped,
  };
}

function normalizeResult(result = {}) {
  return {
    ok: result.ok !== false,
    output: result.output || result.stdout || "",
    cliSessionRef: result.cliSessionRef || result.codexThreadId || null,
    error: result.error || result.stderr || "",
    stopped: Boolean(result.stopped),
  };
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

function createRunLogEmitter(request = {}, deps = {}, queued = {}) {
  const logEvent = request.logEvent || deps.logEvent || null;
  const auditEvent = request.auditEvent || deps.auditEvent || (
    request.runtimeAudit === true || deps.runtimeAudit === true ? appendRuntimeAuditEvent : null
  );
  if (typeof logEvent !== "function" && typeof auditEvent !== "function") {
    return () => {};
  }
  const startedAtMs = Date.now();
  const featureFlags = readMigrationFeatureFlags(request.env || process.env);
  return (event, details = {}) => {
    const entry = {
      event,
      level: details.level || "info",
      details: {
        runId: details.runId || queued.runId || request.run?.runId || request.record?.runId || "",
        sessionKey: details.sessionKey || request.agentRequest?.sessionKey || "",
        channel: details.channel || queued.channel || request.record?.channel || request.billing?.channel || "",
        userId: details.userId || queued.userId || request.record?.userId || request.billing?.userId || "",
        chatId: details.chatId || queued.chatId || request.record?.chatId || request.billing?.chatId || "",
        botHome: details.botHome || request.botHome || "",
        featureFlags,
        durationMs: Math.max(0, Date.now() - startedAtMs),
        errorCode: details.errorCode || "",
        ...details,
        level: undefined,
      },
    };
    if (typeof logEvent === "function") {
      logEvent(entry);
    }
    if (typeof auditEvent === "function") {
      void Promise.resolve(auditEvent(entry, request.botHome)).catch(() => {});
    }
  };
}

async function resolveBrokerEvents(events = [], request = {}, queued = {}, emitLog = () => {}) {
  for (const event of events) {
    if (event.type === "permission.requested" && request.permissionBroker) {
      const permission = event.payload?.permission || event.payload || {};
      emitLog("permission requested", {
        actionId: permission.actionId || "",
      });
      const brokerResult = await request.permissionBroker.waitForPermission?.({
        ...permission,
        runId: permission.runId || queued.runId,
      });
      emitLog(`permission ${brokerResult?.decision || "resolved"}`, {
        actionId: permission.actionId || "",
        errorCode: brokerResult?.ok ? "" : brokerResult?.reason || "permission_denied",
        level: brokerResult?.ok ? "info" : "warn",
      });
      if (!brokerResult?.ok) {
        return {
          ok: false,
          stopped: brokerResult?.decision === "deny",
          error: brokerResult?.reason || "permission_denied",
        };
      }
    }
    if (event.type === "question.requested" && request.questionBroker) {
      const question = event.payload?.question || event.payload || {};
      emitLog("question requested", {
        questionId: question.questionId || "",
      });
      const brokerResult = await request.questionBroker.waitForAnswer?.({
        ...question,
        runId: question.runId || queued.runId,
      });
      emitLog(`question ${brokerResult?.decision || "resolved"}`, {
        questionId: question.questionId || "",
        errorCode: brokerResult?.ok ? "" : brokerResult?.reason || "question_unanswered",
        level: brokerResult?.ok ? "info" : "warn",
      });
      if (!brokerResult?.ok) {
        return {
          ok: false,
          stopped: brokerResult?.decision === "cancelled",
          error: brokerResult?.reason || "question_unanswered",
        };
      }
    }
  }
  return { ok: true };
}

export async function executeRun(request = {}, deps = {}) {
  const runServices = deps.runServices || createDefaultRunServices();
  const settleBilling = deps.settleFailedRunBilling || settleFailedRunBilling;
  const agentAdapter = deps.agentAdapter;
  if (!agentAdapter || typeof agentAdapter.runTurn !== "function") {
    throw new Error("RunExecutor requires an agentAdapter.runTurn function.");
  }

  const botHome = request.botHome;
  const events = Array.isArray(request.events) ? [...request.events] : [];
  const queued = request.run || await runServices.createQueuedRun({
    ...(request.record || {}),
    agentProvider: request.agentProvider || "codex-cli",
    events,
    policy: request.policy,
  }, botHome);
  const emitLog = createRunLogEmitter(request, deps, queued);
  emitLog("run created");

  await runServices.markRunRunning(queued.runId, {
    ...(request.runningPatch || {}),
    agentProvider: request.agentProvider || queued.agentProvider || "codex-cli",
    events,
  }, botHome);
  emitLog("run started");
  await request.onRunning?.(queued);

  const onEvent = (event) => {
    const nextEvent = {
      ...event,
      runId: event.runId || queued.runId,
    };
    events.push(nextEvent);
    request.onEvent?.(nextEvent);
  };

  try {
    const result = normalizeResult(await agentAdapter.runTurn({
      ...request.agentRequest,
      runId: queued.runId,
    }, {
      onEvent,
    }));
    const brokerResolution = await resolveBrokerEvents(events, request, queued, emitLog);
    if (!brokerResolution.ok) {
      if (brokerResolution.stopped) {
        const stopped = await runServices.markRunStopped(queued.runId, brokerResolution.error, {
          events,
        }, botHome);
        emitLog("run stopped", {
          errorCode: brokerResolution.error,
          level: "warn",
        });
        return {
          run: stopped,
          result: {
            ok: false,
            stopped: true,
            error: brokerResolution.error,
          },
          events,
        };
      }
      await settleFailedBillingSafely(settleBilling, {
        ...(request.billing || {}),
        failureType: "failed",
        runId: queued.runId,
        botHome,
      });
      emitLog("billing refunded", {
        failureType: "failed",
      });
      const failed = await runServices.markRunFailed(queued.runId, brokerResolution.error, {
        events,
      }, botHome);
      emitLog("run failed", {
        errorCode: brokerResolution.error,
        level: "error",
      });
      return {
        run: failed,
        result: {
          ok: false,
          error: brokerResolution.error,
        },
        events,
      };
    }

    if (result.stopped) {
      const stopped = await runServices.markRunStopped(queued.runId, "user_stop", {
        events,
      }, botHome);
      emitLog("run stopped", {
        errorCode: "user_stop",
        level: "warn",
      });
      return {
        run: stopped,
        result,
        events,
      };
    }

    if (!result.ok) {
      await settleFailedBillingSafely(settleBilling, {
        ...(request.billing || {}),
        failureType: "failed",
        runId: queued.runId,
        botHome,
      });
      emitLog("billing refunded", {
        failureType: "failed",
      });
      const failed = await runServices.markRunFailed(queued.runId, result.error || "Agent run failed.", {
        events,
      }, botHome);
      emitLog("run failed", {
        errorCode: result.error || "agent_run_failed",
        level: "error",
      });
      return {
        run: failed,
        result,
        events,
      };
    }

    const completed = await runServices.markRunCompleted(queued.runId, {
      codexThreadId: result.cliSessionRef,
      output: result.output,
      agentProvider: request.agentProvider || queued.agentProvider || "codex-cli",
      events,
    }, botHome);
    emitLog("run completed");
    return {
      run: completed,
      result,
      events,
    };
  } catch (error) {
    await settleFailedBillingSafely(settleBilling, {
      ...(request.billing || {}),
      failureType: "failed",
      runId: queued.runId,
      botHome,
    });
    emitLog("billing refunded", {
      failureType: "failed",
    });
    const failed = await runServices.markRunFailed(queued.runId, error, {
      events,
    }, botHome);
    emitLog("run failed", {
      errorCode: error?.message || "agent_exception",
      level: "error",
    });
    return {
      run: failed,
      result: {
        ok: false,
        error,
      },
      events,
    };
  }
}
