import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { importFresh, withTempHome } from "../helpers/module.js";

test("workspace policy allows paths inside workspace and denies parent traversal", async () => {
  await withTempHome(async (home) => {
    const { createWorkspacePolicy } = await importFresh("../../src/policy/workspace-policy.mjs");
    const workspaceRoot = path.join(home, "workspace");
    const policy = createWorkspacePolicy({ workspaceRoot });

    assert.equal(policy.canRead("notes.md").ok, true);
    assert.equal(policy.canWrite("outputs/result.md").ok, true);
    assert.equal(policy.canRead("../secret.txt").ok, false);
    assert.equal(policy.canRead("../secret.txt").reason, "outside_workspace");
  });
});

test("workspace policy supports denied paths and role-based default writes", async () => {
  await withTempHome(async (home) => {
    const { createDefaultWorkspacePolicy } = await importFresh("../../src/policy/workspace-policy.mjs");
    const workspaceRoot = path.join(home, "workspace");
    const userPolicy = createDefaultWorkspacePolicy({ workspaceRoot, role: "user" });
    const ownerPolicy = createDefaultWorkspacePolicy({ workspaceRoot, role: "owner" });

    assert.equal(userPolicy.canWrite("outputs/result.md").ok, true);
    assert.equal(userPolicy.canWrite("README.md").ok, false);
    assert.equal(ownerPolicy.canWrite("README.md").ok, true);
    assert.equal(ownerPolicy.canRead(".env").ok, false);
    assert.equal(ownerPolicy.canRead(".env").reason, "denied_path");
  });
});
