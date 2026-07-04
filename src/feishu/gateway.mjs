export function createFeishuGatewayClients({
  Lark,
  appId,
  appSecret,
  domain = Lark.Domain.Feishu,
  loggerLevel = Lark.LoggerLevel.info,
}) {
  if (!Lark) {
    throw new Error("Feishu gateway requires a Lark SDK instance.");
  }
  if (!appId || !appSecret) {
    throw new Error("Feishu gateway requires appId and appSecret.");
  }

  return {
    client: new Lark.Client({
      appId,
      appSecret,
      domain,
    }),
    wsClient: new Lark.WSClient({
      appId,
      appSecret,
      domain,
      loggerLevel,
    }),
  };
}

export function createFeishuEventDispatcher({ Lark, onMessage }) {
  if (!Lark) {
    throw new Error("Feishu event dispatcher requires a Lark SDK instance.");
  }
  if (typeof onMessage !== "function") {
    throw new Error("Feishu event dispatcher requires an onMessage handler.");
  }

  return new Lark.EventDispatcher({}).register({
    "im.message.receive_v1": onMessage,
  });
}

export function startFeishuGateway({
  Lark,
  appId,
  appSecret,
  onMessage,
  domain = Lark.Domain.Feishu,
  loggerLevel = Lark.LoggerLevel.info,
}) {
  const { client, wsClient } = createFeishuGatewayClients({
    Lark,
    appId,
    appSecret,
    domain,
    loggerLevel,
  });

  wsClient.start({
    eventDispatcher: createFeishuEventDispatcher({ Lark, onMessage }),
  });

  return { client, wsClient };
}

export function createFeishuCardActionHandler({
  Lark,
  encryptKey,
  verificationToken,
  loggerLevel = Lark.LoggerLevel.info,
  onAction,
}) {
  if (!Lark) {
    throw new Error("Feishu card action handler requires a Lark SDK instance.");
  }
  if (typeof onAction !== "function") {
    throw new Error("Feishu card action handler requires an onAction handler.");
  }

  return new Lark.CardActionHandler({
    encryptKey,
    verificationToken,
    loggerLevel,
  }, onAction);
}
