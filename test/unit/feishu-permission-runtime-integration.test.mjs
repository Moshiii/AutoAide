import test from "node:test";
import assert from "node:assert/strict";

import { importFresh, withTempHome } from "../helpers/module.js";

const SECRET = "test-secret-with-enough-length";
const NOW = Date.parse("2026-06-25T08:00:00.000Z");

function createScheduler() {
  const timers = [];
  return {
    setTimeoutFn: (fn, delay) => {
      const timer = { fn, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: (timer) => {
      timer.cleared = true;
    },
  };
}

test("Feishu permission runtime completes after signed card callback allow", async () => {
  await withTempHome(async () => {
    const { executeRun } = await importFresh("../../src/runtime/run-executor.mjs");
    const { PermissionBroker } = await importFresh("../../src/permissions/permission-broker.mjs");
    const { FeishuPermissionBroker } = await importFresh("../../src/permissions/feishu-permission-broker.mjs");
    const { routeFeishuCardAction } = await importFresh("../../src/feishu/callback-router.mjs");
    const scheduler = createScheduler();
    const snapshots = [];
    const broker = new PermissionBroker({
      now: () => NOW,
      setTimeoutFn: scheduler.setTimeoutFn,
      clearTimeoutFn: scheduler.clearTimeoutFn,
      createId: () => "nonce_1",
    });
    const feishuBroker = new FeishuPermissionBroker({
      broker,
      signingSecret: SECRET,
      cardController: {
        publish: async (snapshot) => {
          snapshots.push(snapshot);
        },
      },
    });

    const runPromise = executeRun({
      record: {
        userId: "feishu:user_1",
        channel: "feishu",
      },
      permissionBroker: feishuBroker,
    }, {
      agentAdapter: {
        async runTurn(_request, handlers) {
          handlers.onEvent({
            type: "permission.requested",
            payload: {
              permission: {
                actionId: "act_1",
                userId: "feishu:user_1",
                channel: "feishu",
                payload: { command: "npm test" },
                summary: "Run tests",
              },
            },
          });
          return {
            ok: true,
            output: "approved run",
          };
        },
      },
    });
    for (let attempt = 0; attempt < 20 && snapshots.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    assert.equal(snapshots.length, 1);
    const allowValue = {
      ...snapshots[0].permission,
      action: "permission.allow",
    };
    const routed = routeFeishuCardAction({ action: { value: allowValue } }, {
      secret: SECRET,
      permissionBroker: broker,
      expectedPayload: { command: "npm test" },
      now: NOW,
    });

    assert.equal(routed.ok, true);

    const result = await runPromise;
    assert.equal(result.run.status, "completed");
    assert.equal(result.run.outputPreview, "approved run");
  });
});
