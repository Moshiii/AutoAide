import http from "node:http";

import { createFeishuCardActionHandler } from "./gateway.mjs";

export function createFeishuCallbackServer({
  Lark,
  path = "/webhook/card",
  encryptKey,
  verificationToken,
  loggerLevel,
  onAction,
} = {}) {
  if (!Lark) {
    throw new Error("Feishu callback server requires a Lark SDK instance.");
  }
  if (typeof Lark.adaptDefault !== "function") {
    throw new Error("Feishu callback server requires Lark.adaptDefault.");
  }

  const cardActionHandler = createFeishuCardActionHandler({
    Lark,
    encryptKey,
    verificationToken,
    loggerLevel,
    onAction,
  });
  const adapted = Lark.adaptDefault(path, cardActionHandler);
  const server = http.createServer((request, response) => {
    adapted(request, response);
  });

  return {
    server,
    cardActionHandler,
    path,
    listen: async ({ port, host = "127.0.0.1" } = {}) => {
      if (port == null) {
        throw new Error("Feishu callback server requires port.");
      }
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      return { port, host, path };
    },
    close: async () => {
      if (!server.listening) {
        return;
      }
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export async function startFeishuCallbackServer(options = {}) {
  const callbackServer = createFeishuCallbackServer(options);
  await callbackServer.listen({
    port: options.port,
    host: options.host,
  });
  return callbackServer;
}
