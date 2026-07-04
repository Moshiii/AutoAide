import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

function createFakeLark() {
  const instances = {
    clients: [],
    wsClients: [],
    dispatchers: [],
    cardActionHandlers: [],
  };

  class Client {
    constructor(config) {
      this.config = config;
      instances.clients.push(this);
    }
  }

  class WSClient {
    constructor(config) {
      this.config = config;
      this.startedWith = null;
      instances.wsClients.push(this);
    }

    start(options) {
      this.startedWith = options;
    }
  }

  class EventDispatcher {
    constructor(config) {
      this.config = config;
      this.handlers = null;
      instances.dispatchers.push(this);
    }

    register(handlers) {
      this.handlers = handlers;
      return this;
    }
  }

  class CardActionHandler {
    constructor(config, handler) {
      this.config = config;
      this.handler = handler;
      instances.cardActionHandlers.push(this);
    }
  }

  return {
    Lark: {
      Client,
      WSClient,
      EventDispatcher,
      CardActionHandler,
      Domain: { Feishu: "feishu-domain" },
      LoggerLevel: { info: "info" },
    },
    instances,
  };
}

test("Feishu gateway creates SDK clients with expected defaults", async () => {
  const { createFeishuGatewayClients } = await importFresh("../../src/feishu/gateway.mjs");
  const { Lark, instances } = createFakeLark();

  const { client, wsClient } = createFeishuGatewayClients({
    Lark,
    appId: "cli_a",
    appSecret: "secret",
  });

  assert.equal(client, instances.clients[0]);
  assert.equal(wsClient, instances.wsClients[0]);
  assert.deepEqual(client.config, {
    appId: "cli_a",
    appSecret: "secret",
    domain: "feishu-domain",
  });
  assert.deepEqual(wsClient.config, {
    appId: "cli_a",
    appSecret: "secret",
    domain: "feishu-domain",
    loggerLevel: "info",
  });
});

test("Feishu event dispatcher registers receive-message handler", async () => {
  const { createFeishuEventDispatcher } = await importFresh("../../src/feishu/gateway.mjs");
  const { Lark, instances } = createFakeLark();
  const seen = [];

  const dispatcher = createFeishuEventDispatcher({
    Lark,
    onMessage: (event) => seen.push(event.message.message_id),
  });

  assert.equal(dispatcher, instances.dispatchers[0]);
  assert.equal(typeof dispatcher.handlers["im.message.receive_v1"], "function");

  dispatcher.handlers["im.message.receive_v1"]({
    message: { message_id: "om_1" },
  });

  assert.deepEqual(seen, ["om_1"]);
});

test("Feishu gateway starts WS client with registered dispatcher", async () => {
  const { startFeishuGateway } = await importFresh("../../src/feishu/gateway.mjs");
  const { Lark, instances } = createFakeLark();
  const seen = [];

  const { client, wsClient } = startFeishuGateway({
    Lark,
    appId: "cli_a",
    appSecret: "secret",
    onMessage: (event) => seen.push(event.message.message_id),
  });

  assert.equal(client, instances.clients[0]);
  assert.equal(wsClient, instances.wsClients[0]);
  assert.equal(wsClient.startedWith.eventDispatcher, instances.dispatchers[0]);

  wsClient.startedWith.eventDispatcher.handlers["im.message.receive_v1"]({
    message: { message_id: "om_start" },
  });

  assert.deepEqual(seen, ["om_start"]);
});

test("Feishu gateway creates card action handler", async () => {
  const { createFeishuCardActionHandler } = await importFresh("../../src/feishu/gateway.mjs");
  const { Lark, instances } = createFakeLark();
  const seen = [];

  const handler = createFeishuCardActionHandler({
    Lark,
    encryptKey: "encrypt",
    verificationToken: "verify",
    onAction: (event) => seen.push(event.action.value.action),
  });

  assert.equal(handler, instances.cardActionHandlers[0]);
  assert.deepEqual(handler.config, {
    encryptKey: "encrypt",
    verificationToken: "verify",
    loggerLevel: "info",
  });

  handler.handler({ action: { value: { action: "permission.allow" } } });

  assert.deepEqual(seen, ["permission.allow"]);
});
