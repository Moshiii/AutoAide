import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

const config = {
  ownerUserId: "owner-1",
  adminUserIds: ["admin-1"],
};

test("access policy resolves owner, admin, paid, member, and banned roles", async () => {
  const { resolveAccessRole } = await importFresh("../../src/permissions/access-policy.mjs");

  assert.equal(resolveAccessRole({ envelope: { userId: "owner-1" }, config }), "owner");
  assert.equal(resolveAccessRole({ envelope: { userId: "admin-1" }, config }), "admin");
  assert.equal(resolveAccessRole({ user: { id: "telegram:paid", status: "paid" }, config }), "paid");
  assert.equal(resolveAccessRole({ user: { id: "telegram:free", status: "free" }, config }), "member");
  assert.equal(resolveAccessRole({ user: { id: "telegram:banned", status: "banned" }, config }), "banned");
});

test("access policy gates direct and group chat like existing user access helpers", async () => {
  const { canAccessChat } = await importFresh("../../src/permissions/access-policy.mjs");
  const freeUser = { id: "telegram:1", status: "free", privateEnabled: false };
  const paidUser = { id: "telegram:2", status: "paid", privateEnabled: true };
  const bannedUser = { id: "telegram:3", status: "banned", privateEnabled: true };

  assert.deepEqual(canAccessChat({ envelope: { chatType: "direct", isDirect: true }, user: freeUser }), {
    ok: false,
    reason: "private_chat_locked",
  });
  assert.deepEqual(canAccessChat({ envelope: { chatType: "direct", isDirect: true }, user: paidUser }), {
    ok: true,
    reason: "",
  });
  assert.deepEqual(canAccessChat({ envelope: { chatType: "group", isGroup: true }, user: freeUser }), {
    ok: true,
    reason: "",
  });
  assert.deepEqual(canAccessChat({ envelope: { chatType: "group", isGroup: true }, user: bannedUser }), {
    ok: false,
    reason: "user_banned",
  });
});

test("access policy privileged commands match existing capability policy contract", async () => {
  const { canUseGoal, canUseSchedule } = await importFresh("../../src/capability-policy.mjs");
  const { canUsePrivilegedCommand } = await importFresh("../../src/permissions/access-policy.mjs");
  const directEnvelope = { chatType: "direct", isDirect: true, userId: "member-1" };
  const memberGroup = { chatType: "group", isGroup: true, userId: "member-1" };
  const ownerGroup = { chatType: "group", isGroup: true, userId: "owner-1" };
  const adminGroup = { chatType: "group", isGroup: true, userId: "admin-1" };

  for (const envelope of [directEnvelope, memberGroup, ownerGroup, adminGroup]) {
    assert.equal(canUsePrivilegedCommand({ envelope, config }).ok, canUseGoal(envelope, config));
    assert.equal(canUsePrivilegedCommand({ envelope, config }).ok, canUseSchedule(envelope, config));
  }
  assert.equal(canUsePrivilegedCommand({ envelope: memberGroup, config }).reason, "owner_or_admin_required");
});

test("access policy stop run allows run owner, bot owner, and admins", async () => {
  const { canStopRun } = await importFresh("../../src/permissions/access-policy.mjs");

  assert.deepEqual(canStopRun({
    envelope: { userId: "run-owner" },
    user: { id: "telegram:run-owner", externalUserId: "run-owner", status: "free" },
    config,
    ownerUserId: "run-owner",
  }), {
    ok: true,
    role: "member",
    reason: "",
  });
  assert.equal(canStopRun({ envelope: { userId: "owner-1" }, config, ownerUserId: "someone" }).ok, true);
  assert.equal(canStopRun({ envelope: { userId: "admin-1" }, config, ownerUserId: "someone" }).ok, true);
  assert.deepEqual(canStopRun({ envelope: { userId: "member" }, config, ownerUserId: "someone" }), {
    ok: false,
    role: "member",
    reason: "run_owner_or_admin_required",
  });
});

test("access policy evaluates chat access with role", async () => {
  const { evaluateAccessPolicy } = await importFresh("../../src/permissions/access-policy.mjs");

  assert.deepEqual(evaluateAccessPolicy({
    envelope: { chatType: "direct", isDirect: true, userId: "owner-1" },
    user: { id: "telegram:owner-1", status: "free", privateEnabled: false },
    config,
  }), {
    ok: false,
    role: "owner",
    reason: "private_chat_locked",
    chat: {
      ok: false,
      reason: "private_chat_locked",
    },
  });
});
