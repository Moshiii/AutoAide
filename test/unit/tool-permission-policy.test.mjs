import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("tool permission policy classifies bridge tool actions", async () => {
  const { classifyToolAction } = await importFresh("../../src/permissions/tool-permission-policy.mjs");

  assert.deepEqual(classifyToolAction("shell.exec"), {
    action: "shell.exec",
    capability: "shell",
    risk: "high",
    writes: false,
    network: false,
    shell: true,
  });
  assert.equal(classifyToolAction("network.fetch").risk, "medium");
  assert.equal(classifyToolAction("file.write").capability, "write");
  assert.equal(classifyToolAction("custom.low").risk, "low");
  assert.equal(classifyToolAction("network.fetch", { writes: true }).risk, "high");
});

test("tool permission policy denies missing or disabled capabilities", async () => {
  const { evaluateToolPermission } = await importFresh("../../src/permissions/tool-permission-policy.mjs");
  const { createRunPolicy } = await importFresh("../../src/policy/run-policy.mjs");
  const policy = createRunPolicy();

  assert.deepEqual(evaluateToolPermission({ action: "", policy }), {
    ok: false,
    decision: "deny",
    reason: "missing_action",
    action: "",
    capability: "unknown",
    risk: "low",
    writes: false,
    network: false,
    shell: false,
  });
  assert.equal(evaluateToolPermission({ action: "shell.exec", policy }).decision, "deny");
  assert.equal(evaluateToolPermission({ action: "shell.exec", policy }).reason, "capability_denied:shell");
});

test("tool permission policy requires approval for high risk allowed actions", async () => {
  const { evaluateToolPermission } = await importFresh("../../src/permissions/tool-permission-policy.mjs");
  const { createRunPolicy } = await importFresh("../../src/policy/run-policy.mjs");
  const policy = createRunPolicy({ allowShell: true, allowNetwork: true });

  assert.deepEqual(evaluateToolPermission({ action: "shell.exec", policy }), {
    ok: false,
    decision: "approval_required",
    reason: "high_risk_action",
    action: "shell.exec",
    capability: "shell",
    risk: "high",
    writes: false,
    network: false,
    shell: true,
  });
  assert.equal(evaluateToolPermission({ action: "shell.exec", policy, requireApprovalForHighRisk: false }).decision, "allow");
});

test("tool permission policy allows medium risk capabilities when policy allows them", async () => {
  const { evaluateToolPermission } = await importFresh("../../src/permissions/tool-permission-policy.mjs");
  const { createRunPolicy } = await importFresh("../../src/policy/run-policy.mjs");
  const policy = createRunPolicy({ allowNetwork: true });

  assert.deepEqual(evaluateToolPermission({ action: "network.fetch", policy }), {
    ok: true,
    decision: "allow",
    reason: "",
    action: "network.fetch",
    capability: "network",
    risk: "medium",
    writes: false,
    network: true,
    shell: false,
  });
});

test("tool permission policy builds permission request payloads", async () => {
  const { buildToolPermissionRequest } = await importFresh("../../src/permissions/tool-permission-policy.mjs");
  const { createRunPolicy } = await importFresh("../../src/policy/run-policy.mjs");
  const policy = createRunPolicy({ allowShell: true });

  const request = buildToolPermissionRequest({
    runId: "run_1",
    action: "shell.exec",
    payload: {
      actionId: "allow_shell_1",
      summary: "Run npm install",
      command: "npm install",
    },
    policy,
  });

  assert.equal(request.runId, "run_1");
  assert.equal(request.actionId, "allow_shell_1");
  assert.equal(request.action, "shell.exec");
  assert.equal(request.summary, "Run npm install");
  assert.equal(request.risk, "high");
  assert.equal(request.capability, "shell");
  assert.equal(request.evaluation.decision, "approval_required");
});
