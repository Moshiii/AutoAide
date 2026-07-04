import { chargePreparedChatRequest } from "../chat-request-service.mjs";
import { appendRuntimeAuditEvent } from "../runtime-audit-log.mjs";

function getPreparedRun(prepared = {}) {
  return prepared.run || prepared.item?.prepared?.run || prepared.prepared?.run || {};
}

function getPreparedUser(prepared = {}) {
  return prepared.user || prepared.item?.prepared?.user || prepared.prepared?.user || {};
}

function createAdmissionEventDetails({ prepared = {}, routeKey = "", details = {} } = {}) {
  const run = getPreparedRun(prepared);
  const user = getPreparedUser(prepared);
  return {
    runId: run.runId || details.runId || "",
    sessionKey: details.sessionKey || "",
    channel: run.channel || details.channel || "",
    userId: user.id || run.userId || details.userId || "",
    chatId: run.chatId || details.chatId || "",
    botHome: prepared.chargeRequest?.botHome || details.botHome || "",
    errorCode: details.errorCode || "",
    routeKey: details.routeKey || routeKey,
    ...details,
  };
}

function emitAdmissionEvent(event, {
  prepared = {},
  routeKey = "",
  logEvent,
  auditEvent,
  runtimeAudit = false,
  botHome = prepared.chargeRequest?.botHome,
  details = {},
} = {}) {
  const nextDetails = createAdmissionEventDetails({ prepared, routeKey, details });
  if (typeof logEvent === "function") {
    logEvent(event, nextDetails);
  }
  const appendAudit = typeof auditEvent === "function"
    ? auditEvent
    : runtimeAudit === true ? appendRuntimeAuditEvent : null;
  if (typeof appendAudit === "function") {
    void Promise.resolve(appendAudit({
      event,
      level: nextDetails.errorCode ? "warn" : "info",
      details: nextDetails,
    }, botHome || nextDetails.botHome)).catch(() => {});
  }
}

export function submitPreparedRun({
  coordinator,
  routeKey,
  prepared,
  id = prepared?.run?.runId,
  logEvent,
  auditEvent,
  runtimeAudit = false,
} = {}) {
  if (!coordinator) {
    return {
      ok: true,
      status: "ready",
      routeKey,
      prepared,
    };
  }
  const submitted = coordinator.submit(routeKey, {
    id,
    runId: prepared?.run?.runId,
    prepared,
  });
  if (submitted.status === "queued") {
    emitAdmissionEvent("queue enqueued", {
      prepared,
      routeKey: submitted.routeKey,
      logEvent,
      auditEvent,
      runtimeAudit,
      details: {
        position: submitted.position,
        limit: submitted.limit,
      },
    });
    return {
      ...submitted,
      prepared,
      charged: null,
    };
  }
  if (!submitted.ok) {
    emitAdmissionEvent("queue rejected", {
      prepared,
      routeKey: submitted.routeKey,
      logEvent,
      auditEvent,
      runtimeAudit,
      details: {
        errorCode: submitted.reason || "queue_rejected",
        reason: submitted.reason || "queue_rejected",
        limit: submitted.limit,
      },
    });
    return submitted;
  }
  return {
    ...submitted,
    prepared,
  };
}

export async function chargeAdmittedRun(admitted = {}, options = {}) {
  const prepared = admitted.prepared || admitted.item?.prepared || admitted;
  const charged = await chargePreparedChatRequest(prepared, options);
  const event = charged.ok ? "billing charged" : "billing denied";
  emitAdmissionEvent(event, {
    prepared: charged,
    routeKey: admitted.routeKey,
    logEvent: options.logEvent,
    auditEvent: options.auditEvent,
    runtimeAudit: options.runtimeAudit === true,
    botHome: options.botHome || charged.chargeRequest?.botHome,
    details: {
      errorCode: charged.ok ? "" : charged.reason || "billing_denied",
      reason: charged.reason || "",
      costSource: charged.charged?.costSource || "",
      charged: charged.charged?.charged ?? charged.charged?.paidCreditsCharged ?? 0,
    },
  });
  return {
    ...admitted,
    prepared: charged,
    ok: charged.ok,
    status: charged.ok ? "ready" : "denied",
    reason: charged.reason || admitted.reason || "",
    message: charged.message || admitted.message || "",
    charged: charged.charged,
  };
}

export function dequeuePreparedRun({ coordinator, routeKey, logEvent, auditEvent, runtimeAudit = false } = {}) {
  const item = coordinator?.next(routeKey);
  if (!item) {
    return null;
  }
  emitAdmissionEvent("queue dequeued", {
    prepared: item.prepared,
    routeKey,
    logEvent,
    auditEvent,
    runtimeAudit,
    details: {
      runId: item.runId || item.prepared?.run?.runId,
    },
  });
  return {
    ok: true,
    status: "ready",
    routeKey,
    item,
    prepared: item.prepared,
  };
}

export function cancelPreparedRun({ coordinator, routeKey, id, logEvent, auditEvent, runtimeAudit = false } = {}) {
  const item = coordinator?.cancel(routeKey, id);
  if (!item) {
    return null;
  }
  emitAdmissionEvent("queue cancelled", {
    prepared: item.prepared,
    routeKey,
    logEvent,
    auditEvent,
    runtimeAudit,
    details: {
      runId: item.runId || item.prepared?.run?.runId,
    },
  });
  return item;
}
