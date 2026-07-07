import { renderControlPlaneHtml } from "./control-plane/control-plane-template.mjs";

export function renderHtmlPage({ homePath = process.env.HOME || "" } = {}) {
  return renderControlPlaneHtml({ homePath });
}
