import test from "node:test";
import assert from "node:assert/strict";

import { importFresh } from "../helpers/module.js";

test("control plane page renders the control plane shell and demo prompt data", async () => {
  const { renderHtmlPage } = await importFresh("../../src/control-plane-page.mjs");

  const html = renderHtmlPage();

  assert.match(html, /CodexBridge Control Plane/);
  assert.match(html, /class="app"/);
  assert.match(html, /class="sidebar"/);
  assert.match(html, /id="page-root"/);
  assert.match(html, /data-nav="overview"/);
  assert.match(html, /data-nav="bots"/);
  assert.match(html, /data-nav="runs"/);
  assert.match(html, /data-nav="users"/);
  assert.match(html, /data-nav="settings"/);
  assert.doesNotMatch(html, /class="topbar"/);
  assert.doesNotMatch(html, /id="inspector-root"/);
  assert.match(html, /function renderOverview/);
  assert.match(html, /function renderBots/);
  assert.match(html, /function loadDashboard/);
  assert.match(html, /Global dashboard for bots, users, conversations, runs, workspace usage, and credits/);
  assert.match(html, /Total credits consumed/);
  assert.match(html, /function renderSetup/);
  assert.match(html, /function renderChannels/);
  assert.match(html, /function renderRuns/);
  assert.match(html, /function renderWorkspace/);
  assert.match(html, /function renderUsers/);
  assert.match(html, /function renderSafety/);
  assert.match(html, /function renderSettings/);
  assert.match(html, /workspaceDemoPrompts/);
  assert.match(html, /Create a 3-day Beijing weekend plan/);
  assert.match(html, /Reply with one short sentence confirming CodexBridge is ready/);
  assert.match(html, /__openSetupStep/);
  assert.match(html, /__useWorkspaceDemoPrompt/);
  assert.match(html, /__allowTelegramAccess/);
  assert.match(html, /__reviewConversationLog/);
});

test("control plane page escapes dynamic fields before assigning generated HTML", async () => {
  const { renderHtmlPage } = await importFresh("../../src/control-plane-page.mjs");

  const html = renderHtmlPage();

  assert.match(html, /function escapeHtml/);
  assert.match(html, /function botLabel/);
  assert.match(html, /escapeHtml\(botLabel\(bot\)\)/);
  assert.match(html, /data-dashboard-bot/);
  assert.match(html, /attr\(bot\.id\)/);
  assert.match(html, /chip\(bot\.runtimeStatus === "running"/);
  assert.match(html, /escapeHtml\(run\.id \|\| "-"\)/);
  assert.match(html, /escapeHtml\(user\.displayName \|\| user\.id\)/);
  assert.doesNotMatch(html, /innerHTML = bot\.name/);
  assert.doesNotMatch(html, /innerHTML = user\.displayName/);
});

test("control plane page injects the compact path home instead of hardcoding a developer path", async () => {
  const { renderHtmlPage } = await importFresh("../../src/control-plane-page.mjs");

  const html = renderHtmlPage({ homePath: "/srv/codexbridge/" });

  assert.match(html, /const compactPathHome = "\/srv\/codexbridge";/);
  assert.doesNotMatch(html, /const compactPathHome = "\/Users\/moshiwei";/);
});
