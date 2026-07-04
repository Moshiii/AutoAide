export function normalizeFeishuText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return "Done.";
  }
  return trimmed.length > 3500 ? `${trimmed.slice(0, 3497)}...` : trimmed;
}

export async function sendFeishuText(client, chatId, text, options = {}) {
  const content = JSON.stringify({ text: normalizeFeishuText(text) });
  if (options.replyToMessageId) {
    return await client.im.message.reply({
      path: {
        message_id: options.replyToMessageId,
      },
      data: {
        msg_type: "text",
        content,
      },
    });
  }

  return await client.im.message.create({
    params: {
      receive_id_type: "chat_id",
    },
    data: {
      receive_id: chatId,
      msg_type: "text",
      content,
    },
  });
}

export async function sendFeishuCard(client, chatId, card, options = {}) {
  const content = JSON.stringify(card);
  if (options.replyToMessageId) {
    return await client.im.message.reply({
      path: {
        message_id: options.replyToMessageId,
      },
      data: {
        msg_type: "interactive",
        content,
      },
    });
  }

  return await client.im.message.create({
    params: {
      receive_id_type: "chat_id",
    },
    data: {
      receive_id: chatId,
      msg_type: "interactive",
      content,
    },
  });
}

export async function updateFeishuCard(client, messageId, card) {
  return await client.im.message.patch({
    path: {
      message_id: messageId,
    },
    data: {
      content: JSON.stringify(card),
    },
  });
}
