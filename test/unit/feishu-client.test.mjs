import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("Feishu client sends reply text with normalized content", async () => {
  const { sendFeishuText } = await importFresh("../../src/feishu/client.mjs");
  const calls = [];
  const client = {
    im: {
      message: {
        reply: async (payload) => {
          calls.push(["reply", payload]);
          return { ok: true };
        },
        create: async (payload) => {
          calls.push(["create", payload]);
          return { ok: true };
        },
      },
    },
  };

  await sendFeishuText(client, "oc_1", "", { replyToMessageId: "om_1" });

  assert.equal(calls[0][0], "reply");
  assert.deepEqual(calls[0][1], {
    path: { message_id: "om_1" },
    data: {
      msg_type: "text",
      content: JSON.stringify({ text: "Done." }),
    },
  });
});

test("Feishu client sends create text with chat id", async () => {
  const { sendFeishuText } = await importFresh("../../src/feishu/client.mjs");
  const calls = [];
  const client = {
    im: {
      message: {
        reply: async (payload) => calls.push(["reply", payload]),
        create: async (payload) => {
          calls.push(["create", payload]);
          return { ok: true };
        },
      },
    },
  };

  await sendFeishuText(client, "oc_1", "hello");

  assert.equal(calls[0][0], "create");
  assert.deepEqual(calls[0][1], {
    params: { receive_id_type: "chat_id" },
    data: {
      receive_id: "oc_1",
      msg_type: "text",
      content: JSON.stringify({ text: "hello" }),
    },
  });
});

test("Feishu client sends reply card with interactive content", async () => {
  const { sendFeishuCard } = await importFresh("../../src/feishu/client.mjs");
  const calls = [];
  const card = { config: { update_multi: true }, elements: [] };
  const client = {
    im: {
      message: {
        reply: async (payload) => {
          calls.push(["reply", payload]);
          return { ok: true };
        },
        create: async (payload) => calls.push(["create", payload]),
      },
    },
  };

  await sendFeishuCard(client, "oc_1", card, { replyToMessageId: "om_1" });

  assert.equal(calls[0][0], "reply");
  assert.deepEqual(calls[0][1], {
    path: { message_id: "om_1" },
    data: {
      msg_type: "interactive",
      content: JSON.stringify(card),
    },
  });
});

test("Feishu client adds a Typing reaction to a message", async () => {
  const { FEISHU_TYPING_REACTION, addFeishuReaction } = await importFresh("../../src/feishu/client.mjs");
  const calls = [];
  const client = {
    im: {
      messageReaction: {
        create: async (payload) => {
          calls.push(["reaction.create", payload]);
          return { data: { reaction_id: "react_1" } };
        },
      },
    },
  };

  await addFeishuReaction(client, "om_1");

  assert.deepEqual(calls, [[
    "reaction.create",
    {
      path: { message_id: "om_1" },
      data: {
        reaction_type: {
          emoji_type: FEISHU_TYPING_REACTION,
        },
      },
    },
  ]]);
});

test("Feishu client updates cards with message patch", async () => {
  const { updateFeishuCard } = await importFresh("../../src/feishu/client.mjs");
  const calls = [];
  const card = { config: { update_multi: true }, elements: [] };
  const client = {
    im: {
      message: {
        patch: async (payload) => {
          calls.push(["patch", payload]);
          return { ok: true };
        },
      },
    },
  };

  await updateFeishuCard(client, "om_card", card);

  assert.deepEqual(calls, [[
    "patch",
    {
      path: { message_id: "om_card" },
      data: {
        content: JSON.stringify(card),
      },
    },
  ]]);
});
