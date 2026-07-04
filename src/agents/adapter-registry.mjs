import { createCodexCliAdapter } from "./codex-cli-adapter.mjs";
import { createCodexSdkAdapter } from "./codex-sdk-adapter.mjs";
import { assertAgentAdapter } from "./types.mjs";

export const DEFAULT_AGENT_PROVIDER = "codex-cli";
export const EXPERIMENTAL_SDK_PROVIDER = "codex-sdk";

function normalizeProvider(value) {
  return String(value || DEFAULT_AGENT_PROVIDER).trim().toLowerCase();
}

export function createAgentAdapterRegistry(options = {}) {
  const factories = new Map();

  function register(provider, factory) {
    const normalized = normalizeProvider(provider);
    if (!normalized) {
      throw new Error("Agent adapter provider is required.");
    }
    if (typeof factory !== "function") {
      throw new Error(`Agent adapter '${normalized}' requires a factory function.`);
    }
    factories.set(normalized, factory);
    return normalized;
  }

  function has(provider) {
    return factories.has(normalizeProvider(provider));
  }

  function create(provider = DEFAULT_AGENT_PROVIDER, config = {}) {
    const normalized = normalizeProvider(provider);
    const factory = factories.get(normalized);
    if (!factory) {
      throw new Error(`Unknown agent provider '${normalized}'.`);
    }
    return assertAgentAdapter(factory(config), normalized);
  }

  function list() {
    return Array.from(factories.keys()).sort();
  }

  register(DEFAULT_AGENT_PROVIDER, options.createCodexCliAdapter || createCodexCliAdapter);
  register(EXPERIMENTAL_SDK_PROVIDER, options.createCodexSdkAdapter || createCodexSdkAdapter);
  for (const [provider, factory] of Object.entries(options.adapters || {})) {
    register(provider, factory);
  }

  return {
    register,
    has,
    create,
    list,
  };
}

export function resolveAgentProvider(env = process.env) {
  return normalizeProvider(env.CODEXBRIDGE_AGENT_PROVIDER || DEFAULT_AGENT_PROVIDER);
}

export function createAgentAdapterForEnv(env = process.env, config = {}, options = {}) {
  const registry = options.registry || createAgentAdapterRegistry(options);
  return registry.create(resolveAgentProvider(env), config);
}
