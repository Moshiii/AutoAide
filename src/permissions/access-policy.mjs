import { isDirectEnvelope, isGroupEnvelope, isOwnerOrAdmin } from "../capability-policy.mjs";
import { canUseGroupChat, canUsePrivateChat } from "../users-state.mjs";

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeAdminIds(config = {}) {
  return Array.isArray(config.adminUserIds)
    ? config.adminUserIds.map(normalizeId).filter(Boolean)
    : [];
}

export function resolveAccessRole({ envelope = {}, user = null, config = {} } = {}) {
  const envelopeUserId = normalizeId(envelope.userId);
  const userId = normalizeId(user?.id);
  const externalUserId = normalizeId(user?.externalUserId);
  const candidateIds = new Set([envelopeUserId, userId, externalUserId].filter(Boolean));

  if (user?.status === "banned") {
    return "banned";
  }
  if (user?.status === "admin") {
    return "admin";
  }

  const ownerUserId = normalizeId(config.ownerUserId);
  if (ownerUserId && candidateIds.has(ownerUserId)) {
    return "owner";
  }

  const adminIds = normalizeAdminIds(config);
  if (adminIds.some((id) => candidateIds.has(id))) {
    return "admin";
  }

  if (user?.status === "paid" || user?.privateEnabled) {
    return "paid";
  }
  return "member";
}

export function canAccessChat({ envelope = {}, user = null } = {}) {
  if (user?.status === "banned") {
    return {
      ok: false,
      reason: "user_banned",
    };
  }
  if (isDirectEnvelope(envelope)) {
    const ok = canUsePrivateChat(user || {});
    return {
      ok,
      reason: ok ? "" : "private_chat_locked",
    };
  }
  if (isGroupEnvelope(envelope)) {
    const ok = canUseGroupChat(user || {});
    return {
      ok,
      reason: ok ? "" : "user_banned",
    };
  }
  return {
    ok: false,
    reason: "unknown_chat_type",
  };
}

export function canUsePrivilegedCommand({ envelope = {}, user = null, config = {}, directAllowed = true } = {}) {
  if (user?.status === "banned") {
    return {
      ok: false,
      role: "banned",
      reason: "user_banned",
    };
  }
  const role = resolveAccessRole({ envelope, user, config });
  const ok = (directAllowed && isDirectEnvelope(envelope)) || role === "owner" || role === "admin" || isOwnerOrAdmin(envelope, config);
  return {
    ok,
    role,
    reason: ok ? "" : "owner_or_admin_required",
  };
}

export function canStopRun({ envelope = {}, user = null, config = {}, ownerUserId = "" } = {}) {
  if (user?.status === "banned") {
    return {
      ok: false,
      role: "banned",
      reason: "user_banned",
    };
  }
  const role = resolveAccessRole({ envelope, user, config });
  const requesterIds = new Set([
    normalizeId(envelope.userId),
    normalizeId(user?.id),
    normalizeId(user?.externalUserId),
  ].filter(Boolean));
  const owner = normalizeId(ownerUserId);
  const ok = (owner && requesterIds.has(owner)) || role === "owner" || role === "admin";
  return {
    ok,
    role,
    reason: ok ? "" : "run_owner_or_admin_required",
  };
}

export function evaluateAccessPolicy(input = {}) {
  const chat = canAccessChat(input);
  const role = resolveAccessRole(input);
  return {
    ok: chat.ok,
    role,
    reason: chat.reason,
    chat,
  };
}
