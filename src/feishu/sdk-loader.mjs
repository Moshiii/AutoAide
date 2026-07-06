const FEISHU_SDK_PACKAGE = "@larksuiteoapi/node-sdk";

export const FEISHU_SDK_INSTALL_HINT = [
  "Feishu channel requires @larksuiteoapi/node-sdk.",
  "Install it next to CodexBridge before starting the Feishu channel:",
  "  npm install @larksuiteoapi/node-sdk",
  "For a global CodexBridge install, use:",
  "  npm install -g @larksuiteoapi/node-sdk",
].join("\n");

function isMissingFeishuSdk(error) {
  return (
    error?.code === "ERR_MODULE_NOT_FOUND" &&
    String(error?.message || "").includes(FEISHU_SDK_PACKAGE)
  );
}

export async function loadFeishuSdk({ optional = false } = {}) {
  try {
    return await import(FEISHU_SDK_PACKAGE);
  } catch (error) {
    if (!isMissingFeishuSdk(error)) {
      throw error;
    }
    if (optional) {
      return null;
    }
    const nextError = new Error(FEISHU_SDK_INSTALL_HINT);
    nextError.code = "CODEXBRIDGE_FEISHU_SDK_MISSING";
    nextError.cause = error;
    throw nextError;
  }
}
