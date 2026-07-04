import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("run policy defaults to conservative capabilities", async () => {
  const { canUseCapability, createRunPolicy } = await importFresh("../../src/policy/run-policy.mjs");
  const policy = createRunPolicy();

  assert.equal(canUseCapability(policy, "network"), false);
  assert.equal(canUseCapability(policy, "shell"), false);
  assert.equal(canUseCapability(policy, "git"), false);
  assert.equal(canUseCapability(policy, "mcp"), false);
  assert.equal(policy.maxRunSeconds, 300);
});

test("run policy gives owner direct chats broader defaults than group users", async () => {
  const { canUseCapability, createDefaultRunPolicy } = await importFresh("../../src/policy/run-policy.mjs");
  const ownerDirect = createDefaultRunPolicy({ role: "owner", chatType: "direct" });
  const ownerGroup = createDefaultRunPolicy({ role: "owner", chatType: "group" });
  const userDirect = createDefaultRunPolicy({ role: "user", chatType: "direct" });

  assert.equal(canUseCapability(ownerDirect, "shell"), true);
  assert.equal(canUseCapability(ownerGroup, "shell"), false);
  assert.equal(canUseCapability(userDirect, "shell"), false);
  assert.equal(ownerDirect.maxRunSeconds > userDirect.maxRunSeconds, true);
});

test("run policy filters environment through allowlist", async () => {
  const { createRunPolicy, filterEnv } = await importFresh("../../src/policy/run-policy.mjs");
  const policy = createRunPolicy({ envAllowlist: ["PATH", "CODEX_HOME"] });

  assert.deepEqual(filterEnv({
    PATH: "/bin",
    CODEX_HOME: "/tmp/codex",
    SECRET_TOKEN: "nope",
  }, policy), {
    PATH: "/bin",
    CODEX_HOME: "/tmp/codex",
  });
});
