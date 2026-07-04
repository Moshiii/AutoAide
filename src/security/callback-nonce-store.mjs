import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export class CallbackNonceStore {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.used = new Map();
  }

  has(nonce) {
    this.prune();
    return this.used.has(nonce);
  }

  consume(nonce, expiresAt) {
    if (!nonce) {
      return { ok: false, reason: "missing_nonce" };
    }
    const expiresAtMs = normalizeTimeMs(expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      return { ok: false, reason: "invalid_expiry" };
    }
    if (expiresAtMs <= this.now()) {
      return { ok: false, reason: "expired" };
    }
    this.prune();
    if (this.used.has(nonce)) {
      return { ok: false, reason: "nonce_replay" };
    }

    this.used.set(nonce, expiresAtMs);
    return { ok: true };
  }

  prune() {
    const now = this.now();
    for (const [nonce, expiresAt] of this.used.entries()) {
      if (expiresAt <= now) {
        this.used.delete(nonce);
      }
    }
  }
}

export class PersistentCallbackNonceStore extends CallbackNonceStore {
  constructor({ filePath, now = () => Date.now() } = {}) {
    super({ now });
    if (!filePath) {
      throw new Error("Persistent callback nonce store requires filePath.");
    }
    this.filePath = filePath;
    this.load();
    this.prune();
    this.save();
  }

  consume(nonce, expiresAt) {
    const result = super.consume(nonce, expiresAt);
    if (result.ok || result.reason === "nonce_replay" || result.reason === "expired") {
      this.save();
    }
    return result;
  }

  prune() {
    super.prune();
  }

  load() {
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8"));
      const entries = raw?.used && typeof raw.used === "object" ? Object.entries(raw.used) : [];
      this.used = new Map(entries
        .map(([nonce, expiresAt]) => [nonce, Number(expiresAt)])
        .filter(([nonce, expiresAt]) => nonce && Number.isFinite(expiresAt)));
    } catch {
      this.used = new Map();
    }
  }

  save() {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const data = {
      version: 1,
      used: Object.fromEntries(this.used.entries()),
    };
    writeFileSync(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

export function normalizeTimeMs(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}
