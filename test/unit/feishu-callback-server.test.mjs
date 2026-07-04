import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { importFresh } from "../helpers/module.js";

function createFakeLark() {
  const instances = {
    cardActionHandlers: [],
    adaptCalls: [],
  };

  class CardActionHandler {
    constructor(config, handler) {
      this.config = config;
      this.handler = handler;
      instances.cardActionHandlers.push(this);
    }
  }

  return {
    Lark: {
      CardActionHandler,
      LoggerLevel: { info: "info" },
      adaptDefault: (path, handler) => {
        instances.adaptCalls.push({ path, handler });
        return (request, response) => {
          response.statusCode = path === request.url ? 204 : 404;
          response.end();
        };
      },
    },
    instances,
  };
}

function requestStatus({ port, path }) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      path,
      method: "POST",
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
    request.end();
  });
}

test("Feishu callback server creates card action handler and adapts HTTP path", async () => {
  const { createFeishuCallbackServer } = await importFresh("../../src/feishu/callback-server.mjs");
  const { Lark, instances } = createFakeLark();
  const seen = [];

  const callbackServer = createFeishuCallbackServer({
    Lark,
    path: "/webhook/card",
    encryptKey: "encrypt",
    verificationToken: "verify",
    onAction: (event) => seen.push(event.action.value.action),
  });

  assert.equal(callbackServer.cardActionHandler, instances.cardActionHandlers[0]);
  assert.equal(instances.adaptCalls[0].path, "/webhook/card");
  assert.equal(instances.adaptCalls[0].handler, callbackServer.cardActionHandler);
  assert.deepEqual(callbackServer.cardActionHandler.config, {
    encryptKey: "encrypt",
    verificationToken: "verify",
    loggerLevel: "info",
  });

  callbackServer.cardActionHandler.handler({ action: { value: { action: "permission.allow" } } });
  assert.deepEqual(seen, ["permission.allow"]);
});

test("Feishu callback server listens and closes", async () => {
  const { startFeishuCallbackServer } = await importFresh("../../src/feishu/callback-server.mjs");
  const { Lark } = createFakeLark();

  const callbackServer = await startFeishuCallbackServer({
    Lark,
    port: 0,
    host: "127.0.0.1",
    onAction: () => {},
  });
  const address = callbackServer.server.address();
  assert.equal(await requestStatus({ port: address.port, path: "/webhook/card" }), 204);
  assert.equal(await requestStatus({ port: address.port, path: "/wrong" }), 404);

  await callbackServer.close();
  assert.equal(callbackServer.server.listening, false);
});
