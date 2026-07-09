export function formatBotDisplayName(botOrName, fallbackId = "") {
  if (botOrName && typeof botOrName === "object") {
    const id = String(botOrName.id ?? botOrName.botId ?? fallbackId ?? "").trim();
    const name = String(botOrName.name ?? botOrName.botName ?? id ?? "").trim();
    return id ? `${name || id} (${id})` : name || "unknown";
  }

  const id = String(fallbackId ?? "").trim();
  const name = String(botOrName ?? id ?? "").trim();
  return id ? `${name || id} (${id})` : name || "unknown";
}
