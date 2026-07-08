import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("startup logo is the static CodexBridge wordmark", async () => {
  const { STARTUP_LOGO_LINES, composeStartupBanner } = await importFresh("../../src/ui/banner.mjs");
  const logo = STARTUP_LOGO_LINES.join("\n");
  const rendered = composeStartupBanner().join("\n").replace(/\x1b\[[0-9;]*m/g, "");

  assert.equal(STARTUP_LOGO_LINES.length, 12);
  assert.match(logo, /██████╗ ██████╗ ██████╗/);
  assert.match(logo, /██████╗ ██████╗ ██╗██████╗/);
  assert.match(logo, /╚═════╝ ╚═╝  ╚═╝/);
  assert.ok(Math.max(...STARTUP_LOGO_LINES.map((line) => line.length)) <= 56);
  assert.doesNotMatch(logo, /AutoAide/i);
  assert.match(rendered, /██████╗ ██████╗ ██████╗/);
  assert.doesNotMatch(rendered, /personal AI shell/);
  assert.doesNotMatch(rendered, /booting local operator layer/);
  assert.doesNotMatch(rendered, /╭/);
});

test("interactive startup header stays compact", async () => {
  const { composeInteractiveHeader } = await importFresh("../../src/ui/banner.mjs");

  const rendered = composeInteractiveHeader({ botId: "default", model: "gpt-5.4" })
    .join("\n")
    .replace(/\x1b\[[0-9;]*m/g, "");

  assert.equal(rendered, "CodexBridge · default · gpt-5.4");
  assert.doesNotMatch(rendered, /██████╗/);
  assert.doesNotMatch(rendered, /╭/);
  assert.doesNotMatch(rendered, /personal AI shell/);
});
