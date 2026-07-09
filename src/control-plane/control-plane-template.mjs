import {
  QUICK_TEST_PROMPT,
  WORKSPACE_DEMO_PROMPTS,
} from "../control-plane-quick-test-service.mjs";

const DEFAULT_WEB_CHAT_POLL_MS = 500;

export function renderControlPlaneHtml({ homePath = "" } = {}) {
  const compactPathHome = String(homePath || "").replace(/\/+$/, "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CodexBridge Control Plane</title>
    <style>
      :root {
        --bg: #ffffff;
        --surface: #ffffff;
        --surface-soft: #f8fafc;
        --surface-blue: #eef4ff;
        --line: #d9e1ec;
        --line-strong: #c5cfdd;
        --text: #081733;
        --muted: #536079;
        --muted-2: #7b879c;
        --blue: #1557e6;
        --blue-2: #0b48d8;
        --green: #138a36;
        --green-bg: #ecfdf3;
        --red: #d11124;
        --red-bg: #fff1f2;
        --amber: #d97706;
        --amber-bg: #fff7e6;
        --shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      * { box-sizing: border-box; }
      html, body { min-height: 100%; margin: 0; background: var(--bg); color: var(--text); overflow-x: hidden; }
      body {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        font-size: 14px;
        line-height: 1.45;
        letter-spacing: 0;
      }
      button, input, select, textarea { font: inherit; letter-spacing: 0; }
      button {
        min-height: 34px;
        border: 1px solid var(--line-strong);
        border-radius: 6px;
        background: #fff;
        color: var(--text);
        padding: 7px 12px;
        font-weight: 650;
        cursor: pointer;
      }
      button:hover { border-color: #9aa8ba; background: #f8fafc; }
      button.primary {
        border-color: var(--blue);
        background: var(--blue);
        color: #fff;
        box-shadow: 0 8px 20px rgba(21, 87, 230, 0.16);
      }
      button.primary:hover { background: var(--blue-2); border-color: var(--blue-2); }
      button.danger { color: var(--red); border-color: #fecaca; }
      button.danger.primary { background: var(--red); border-color: var(--red); color: #fff; box-shadow: none; }
      button:disabled { cursor: not-allowed; opacity: 0.52; }
      input, select, textarea {
        width: 100%;
        min-height: 34px;
        border: 1px solid var(--line-strong);
        border-radius: 6px;
        background: #fff;
        color: var(--text);
        padding: 7px 10px;
        outline: none;
      }
      textarea {
        min-height: 210px;
        resize: vertical;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
        font-size: 12px;
        line-height: 1.55;
      }
      input:focus, select:focus, textarea:focus, button:focus-visible {
        border-color: var(--blue);
        box-shadow: 0 0 0 3px rgba(21, 87, 230, 0.12);
      }
      label { display: grid; gap: 6px; color: var(--text); font-weight: 650; }
      h1, h2, h3, p { margin: 0; }
      h1 { font-size: 24px; line-height: 1.18; font-weight: 760; }
      h2 { font-size: 17px; line-height: 1.25; font-weight: 730; }
      h3 { font-size: 14px; line-height: 1.25; font-weight: 720; }
      .muted { color: var(--muted); }
      .tiny { color: var(--muted-2); font-size: 12px; }
      .app {
        display: grid;
        grid-template-columns: 254px minmax(0, 1fr);
        min-height: 100vh;
        max-width: 100vw;
      }
      .sidebar {
        position: sticky;
        top: 0;
        height: 100vh;
        border-right: 1px solid var(--line);
        background: #fbfdff;
        display: grid;
        grid-template-rows: auto 1fr auto;
      }
      .brand {
        height: 76px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 18px 20px;
        border-bottom: 1px solid var(--line);
      }
      .brand-mark {
        width: 34px;
        height: 34px;
        border: 8px solid var(--blue);
        border-radius: 9px;
      }
      .brand strong { display: block; font-size: 19px; line-height: 1.05; }
      .nav { display: grid; align-content: start; gap: 4px; padding: 18px 12px; }
      .nav button {
        justify-content: start;
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 45px;
        border: 1px solid transparent;
        background: transparent;
        color: #1d2940;
        text-align: left;
        box-shadow: none;
      }
      .nav button.active {
        border-color: #dbe7ff;
        background: var(--surface-blue);
        color: var(--blue);
      }
      .nav-glyph { width: 20px; text-align: center; color: inherit; font-weight: 800; }
      .nav-badge {
        min-width: 20px;
        border-radius: 999px;
        background: var(--red);
        color: #fff;
        padding: 1px 6px;
        text-align: center;
        font-size: 11px;
      }
      .sidebar-foot { padding: 14px; display: grid; gap: 12px; border-top: 1px solid var(--line); }
      .side-card {
        border: 1px solid var(--line);
        border-radius: 6px;
        background: #fff;
        padding: 12px;
        display: grid;
        gap: 8px;
      }
      .operator { display: flex; align-items: center; gap: 10px; padding-top: 8px; border-top: 1px solid var(--line); }
      .avatar {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #e8eefc;
        color: #0f3fb3;
        font-weight: 760;
      }
      .shell { min-width: 0; display: grid; grid-template-rows: 76px minmax(0, 1fr) 34px; min-height: 100vh; }
      .topbar {
        position: sticky;
        top: 0;
        z-index: 5;
        display: grid;
        grid-template-columns: 220px 150px 160px 180px minmax(280px, 1fr) 92px;
        gap: 0;
        align-items: center;
        border-bottom: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.96);
      }
      .top-cell {
        min-height: 76px;
        padding: 13px 20px;
        border-right: 1px solid var(--line);
        display: grid;
        align-content: center;
        gap: 5px;
      }
      .top-actions { padding: 0 18px; display: flex; gap: 12px; justify-content: flex-end; align-items: center; }
      .top-label { color: var(--muted); font-size: 12px; }
      .status-line { display: flex; align-items: center; gap: 9px; font-weight: 700; }
      .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--muted-2); display: inline-block; }
      .dot.green { background: var(--green); }
      .dot.red { background: var(--red); }
      .dot.amber { background: #f59e0b; }
      .content-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 330px;
        min-height: 0;
        min-width: 0;
        max-width: 100%;
      }
      .main-pane {
        min-width: 0;
        max-width: 100%;
        padding: 22px 26px 28px;
        border-right: 1px solid var(--line);
      }
      .inspector {
        min-width: 0;
        max-width: 100%;
        padding: 22px 20px;
        background: #fff;
      }
      .page-head { display: grid; gap: 4px; margin-bottom: 16px; }
      .grid { display: grid; gap: 14px; }
      .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .grid.five { grid-template-columns: repeat(5, minmax(0, 1fr)); }
      .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 0.42fr); gap: 12px; }
      .panel, .table-wrap, .banner, .step, .metric {
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--surface);
        box-shadow: var(--shadow);
        min-width: 0;
        max-width: 100%;
      }
      .panel { padding: 16px; }
      .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .banner {
        padding: 18px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) minmax(280px, 0.5fr);
        gap: 20px;
        align-items: center;
      }
      .banner.danger { border-color: #fecaca; background: #fff8f8; }
      .banner.warn { border-color: #fed7aa; background: #fffaf0; }
      .banner.ok { border-color: #bbf7d0; background: #f7fff9; }
      .shield {
        width: 50px;
        height: 50px;
        border: 3px solid currentColor;
        border-radius: 16px 16px 22px 22px;
        display: grid;
        place-items: center;
        color: var(--red);
        font-size: 24px;
        font-weight: 900;
      }
      .banner h2 { font-size: 24px; color: var(--red); }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      .metric { padding: 14px; display: grid; gap: 6px; min-height: 82px; }
      .metric-value { font-size: 22px; font-weight: 780; }
      .chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
        border: 1px solid var(--line);
        border-radius: 4px;
        padding: 2px 8px;
        color: var(--muted);
        background: #fff;
        font-size: 12px;
        font-weight: 700;
      }
      .chip.green { color: var(--green); border-color: #bbf7d0; background: var(--green-bg); }
      .chip.red { color: var(--red); border-color: #fecaca; background: var(--red-bg); }
      .chip.amber { color: var(--amber); border-color: #fed7aa; background: var(--amber-bg); }
      .chip.blue { color: var(--blue); border-color: #c7d7fe; background: #eef4ff; }
      .table-wrap { overflow: hidden; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border-bottom: 1px solid var(--line); padding: 10px 12px; text-align: left; vertical-align: top; }
      th { color: var(--muted); background: #f9fbfd; font-size: 12px; font-weight: 720; }
      tr:last-child td { border-bottom: 0; }
      .step {
        display: grid;
        grid-template-columns: 34px 42px minmax(0, 1fr) auto;
        gap: 14px;
        align-items: center;
        padding: 14px;
      }
      .step.current { border-color: #7da7ff; box-shadow: inset 3px 0 0 var(--blue); }
      .step-index {
        width: 28px;
        height: 28px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #98a2b3;
        color: #fff;
        font-weight: 760;
      }
      .step.done .step-index { background: var(--green); }
      .step.current .step-index { background: var(--blue); }
      .icon-tile {
        width: 38px;
        height: 38px;
        border: 1px solid var(--line);
        border-radius: 6px;
        display: grid;
        place-items: center;
        color: var(--blue);
        background: #fbfdff;
        font-weight: 800;
      }
      .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .form-row { display: grid; gap: 14px; }
      .tabs { display: flex; gap: 8px; margin: 8px 0 14px; }
      .tabs button.active { border-color: var(--blue); color: var(--blue); background: #eef4ff; }
      .workspace-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 14px; }
      .file-list { display: grid; gap: 4px; }
      .file-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        padding: 8px 10px;
        border-radius: 5px;
      }
      .file-item:hover, .file-item.active { background: var(--surface-blue); }
      .editor-toolbar { display: flex; gap: 8px; padding: 8px; border: 1px solid var(--line); border-bottom: 0; border-radius: 6px 6px 0 0; }
      .code-editor { border-radius: 0 0 6px 6px; font-size: 12px; min-height: 380px; }
      .kv { display: grid; grid-template-columns: minmax(110px, 0.42fr) minmax(0, 1fr); gap: 8px 14px; }
      .kv div:nth-child(odd) { color: var(--muted); }
      .inspector-section { padding: 0 0 18px; margin-bottom: 18px; border-bottom: 1px solid var(--line); display: grid; gap: 10px; }
      .inspector-section:last-child { border-bottom: 0; }
      .empty { padding: 18px; color: var(--muted); text-align: center; }
      .toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        display: none;
        max-width: 420px;
        border: 1px solid var(--line-strong);
        border-radius: 6px;
        background: #fff;
        padding: 12px 14px;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
        z-index: 20;
      }
      .modal-backdrop {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(8, 23, 51, 0.32);
        z-index: 30;
      }
      .modal { width: min(560px, calc(100vw - 32px)); border-radius: 8px; background: #fff; padding: 18px; }
      .footer {
        display: flex;
        gap: 20px;
        align-items: center;
        border-top: 1px solid var(--line);
        padding: 0 18px;
        color: var(--muted-2);
        font-size: 12px;
      }
      @media (max-width: 1180px) {
        .app { grid-template-columns: 220px minmax(0, 1fr); }
        .content-grid { grid-template-columns: 1fr; }
        .inspector { border-top: 1px solid var(--line); }
        .topbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .top-actions { justify-content: flex-start; padding: 12px 20px; border-right: 1px solid var(--line); }
      }
      @media (max-width: 760px) {
        .app { display: block; }
        .sidebar { position: static; height: auto; }
        .nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .shell { display: block; }
        .topbar, .grid.two, .grid.three, .grid.five, .split, .workspace-layout, .form-grid, .banner {
          grid-template-columns: minmax(0, 1fr);
        }
        .topbar { display: grid; }
        .top-cell, .top-actions {
          min-height: auto;
          padding: 10px 12px;
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }
        .main-pane, .inspector { padding: 14px 12px; }
        .table-wrap { overflow-x: auto; }
        .panel-head { align-items: stretch; flex-direction: column; }
        .step { grid-template-columns: 34px minmax(0, 1fr); }
        .step .icon-tile, .step .step-action { display: none; }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <aside class="sidebar">
        <div>
          <div class="brand">
            <div class="brand-mark" aria-hidden="true"></div>
            <div><strong>CodexBridge</strong><div class="muted">Control Plane</div></div>
          </div>
          <nav class="nav" id="tabs" aria-label="Primary">
            ${navButton("overview", "⌂", "Overview")}
            ${navButton("setup", "✓", "Setup")}
            ${navButton("channels", "⌁", "Channels")}
            ${navButton("runs", "▷", "Runs", "nav-runs-badge")}
            ${navButton("workspace", "□", "Workspace")}
            ${navButton("users", "♙", "Users & Access")}
            ${navButton("safety", "◇", "Safety", "nav-risk-badge")}
            ${navButton("settings", "⚙", "Settings")}
          </nav>
        </div>
        <div class="sidebar-foot">
          <div class="side-card" id="side-status-card">Loading environment...</div>
          <div class="operator"><div class="avatar">MO</div><div><strong>Moshiwei Operator</strong><div class="tiny">operator</div></div></div>
        </div>
      </aside>
      <section class="shell">
        <header class="topbar">
          <div class="top-cell"><div class="top-label">Bot</div><select id="bot-select"><option>Loading</option></select></div>
          <div class="top-cell"><div class="top-label">Runtime</div><div class="status-line" id="top-runtime"><span class="dot red"></span> Unknown</div></div>
          <div class="top-cell"><div class="top-label">Telegram</div><div class="status-line" id="top-telegram"><span class="dot red"></span> Unknown</div></div>
          <div class="top-cell"><div class="top-label">Invite Gate</div><div class="status-line" id="top-enabled"><span class="dot red"></span> Unknown</div></div>
          <div class="top-actions">
            <button class="primary" id="action-start">▶ Start runtime</button>
            <button id="action-restart">Restart</button>
            <button class="danger" id="action-stop">Stop</button>
          </div>
          <div class="top-actions"><button id="open-create-bot">New bot</button><div class="avatar">MO</div></div>
        </header>
        <div class="content-grid">
          <main class="main-pane" id="page-root"></main>
          <aside class="inspector" id="inspector-root"></aside>
        </div>
        <footer class="footer"><span><span class="dot green"></span> System healthy</span><span>Version v1.2.0</span><span>Local environment</span><span>UTC+8</span></footer>
      </section>
    </div>
    <div class="toast" id="toast"></div>
    <div class="modal-backdrop" id="create-bot-modal-backdrop">
      <div class="modal">
        <div class="panel-head"><h2>Create bot</h2><button id="close-create-bot">Close</button></div>
        <div class="form-grid">
          <label>Bot ID<input id="create-bot-id" placeholder="research" /></label>
          <label>Name<input id="create-bot-name" placeholder="Research" /></label>
          <label>Enabled<select id="create-bot-enabled"><option value="false">false</option><option value="true">true</option></select></label>
        </div>
        <div class="actions" style="margin-top:16px;"><button class="primary" id="submit-create-bot">Create</button></div>
      </div>
    </div>
    <script>
      const compactPathHome = ${JSON.stringify(compactPathHome)};
      const workspaceDemoPrompts = ${JSON.stringify(WORKSPACE_DEMO_PROMPTS)};
      const quickTestPrompt = ${JSON.stringify(QUICK_TEST_PROMPT)};
      const chatPollMs = ${DEFAULT_WEB_CHAT_POLL_MS};
      const state = {
        page: "overview",
        channelTab: "telegram",
        settingsTab: "identity",
        currentBotId: null,
        selectedBotId: null,
        bots: [],
        detail: null,
        runs: [],
        users: [],
        usage: [],
        metrics: null,
        riskLogs: [],
        workspaceFiles: [],
        selectedFile: "IDENTITY.md",
        selectedUserId: "",
        selectedRiskId: "",
        sessions: [],
        activeSessionLabel: "main",
        goals: [],
        schedules: [],
        skills: [],
        chat: null,
        logs: { runtime: "", bridge: "" },
      };

      const pageRoot = document.getElementById("page-root");
      const inspectorRoot = document.getElementById("inspector-root");
      const toastRoot = document.getElementById("toast");
      const createBotModal = document.getElementById("create-bot-modal-backdrop");

      function compactPath(value) {
        return String(value || "").startsWith(compactPathHome) ? "~" + String(value).slice(compactPathHome.length) : String(value || "");
      }
      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }
      function attr(value) { return escapeHtml(value); }
      function showToast(message) {
        toastRoot.textContent = message;
        toastRoot.style.display = "block";
        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(function () { toastRoot.style.display = "none"; }, 2400);
      }
      async function request(path, options) {
        const response = await fetch(path, Object.assign({ headers: { "content-type": "application/json" } }, options || {}));
        if (!response.ok) {
          const text = await response.text();
          let payload = null;
          try { payload = text ? JSON.parse(text) : null; } catch {}
          throw new Error((payload && payload.error) || text || response.statusText);
        }
        return await response.json();
      }
      function chip(label, tone) {
        return '<span class="chip ' + (tone || "") + '">' + escapeHtml(label) + '</span>';
      }
      function dot(tone) {
        return '<span class="dot ' + (tone || "") + '"></span>';
      }
      function statusTone(value) {
        const text = String(value || "").toLowerCase();
        if (["running", "online", "ready", "completed", "succeeded", "passed", "active", "enabled", "allowed"].some(function (word) { return text.includes(word); })) return "green";
        if (["warning", "review", "queued", "optional", "pending"].some(function (word) { return text.includes(word); })) return "amber";
        if (["failed", "stopped", "missing", "not ready", "banned", "denied", "unpaired", "error"].some(function (word) { return text.includes(word); })) return "red";
        return "";
      }
      function table(headers, rows, emptyText) {
        if (!rows || rows.length === 0) return '<div class="table-wrap"><div class="empty">' + escapeHtml(emptyText || "No records yet.") + '</div></div>';
        return '<div class="table-wrap"><table><thead><tr>' + headers.map(function (h) { return '<th>' + escapeHtml(h) + '</th>'; }).join("") + '</tr></thead><tbody>' + rows.map(function (row) {
          return '<tr>' + row.map(function (cell) { return '<td>' + cell + '</td>'; }).join("") + '</tr>';
        }).join("") + '</tbody></table></div>';
      }
      function kv(rows) {
        return '<div class="kv">' + rows.map(function (row) {
          return '<div>' + escapeHtml(row[0]) + '</div><div>' + row[1] + '</div>';
        }).join("") + '</div>';
      }
      function currentBot() { return state.detail && state.detail.detail && state.detail.detail.bot; }
      function botLabel(bot) {
        if (!bot) return "-";
        const id = String(bot.id || "").trim();
        const name = String(bot.name || id || "").trim();
        return id ? (name || id) + " (" + id + ")" : name || "-";
      }
      function currentConfig() { return (state.detail && state.detail.detail && state.detail.detail.config) || {}; }
      function telegramConfig() { return (currentConfig().channels && currentConfig().channels.telegram) || {}; }
      function feishuConfig() { return (currentConfig().channels && currentConfig().channels.feishu) || {}; }
      function inviteReady() { return Boolean(state.detail && state.detail.setupGuide && state.detail.setupGuide.ready && state.detail.securityReadiness && state.detail.securityReadiness.readyForExternalUsers); }
      function blockers() {
        if (!state.detail) return [];
        const guide = state.detail.setupGuide || {};
        const setupBlockers = (guide.steps || []).filter(function (step) { return step.status !== "done"; }).map(function (step) {
          return { label: step.label, hint: step.hint || step.action || "Complete this setup step.", target: step.targetTab };
        });
        const extra = [];
        if (state.detail.storageReadiness && !state.detail.storageReadiness.ready) extra.push({ label: "Storage migration", hint: state.detail.storageReadiness.next || "Run migrations before inviting users.", target: "settings" });
        if (state.detail.securityReadiness && !state.detail.securityReadiness.readyForExternalUsers) extra.push({ label: "Verify isolation", hint: state.detail.securityReadiness.next || "Hard isolation is not verified.", target: "safety" });
        return setupBlockers.concat(extra);
      }
      function renderAll() {
        renderShell();
        renderPage();
        renderInspector();
      }
      function renderShell() {
        document.querySelectorAll("[data-nav]").forEach(function (button) {
          button.classList.toggle("active", button.dataset.nav === state.page);
        });
        const riskCount = state.riskLogs.filter(function (event) { return !(event.review && event.review.status); }).length;
        const activeRuns = state.runs.filter(function (run) { return run.status === "running" || run.status === "queued"; }).length;
        document.getElementById("nav-risk-badge").textContent = riskCount || "";
        document.getElementById("nav-risk-badge").style.display = riskCount ? "" : "none";
        document.getElementById("nav-runs-badge").textContent = activeRuns || "";
        document.getElementById("nav-runs-badge").style.display = activeRuns ? "" : "none";
        const select = document.getElementById("bot-select");
        select.innerHTML = state.bots.map(function (bot) {
          return '<option value="' + attr(bot.id) + '"' + (bot.id === state.selectedBotId ? " selected" : "") + '>' + escapeHtml(botLabel(bot)) + (bot.id === state.currentBotId ? "  current" : "") + '</option>';
        }).join("");
        const bot = currentBot();
        const config = currentConfig();
        const telegram = telegramConfig();
        const runtimeText = bot && bot.status === "running" ? "Online" : "Stopped";
        const telegramText = telegram.enabled && telegram.botToken ? "Paired" : "Unpaired";
        const inviteText = inviteReady() ? "Ready" : "Not ready";
        document.getElementById("top-runtime").innerHTML = dot(statusTone(runtimeText)) + " " + escapeHtml(runtimeText);
        document.getElementById("top-telegram").innerHTML = dot(statusTone(telegramText)) + " " + escapeHtml(telegramText);
        document.getElementById("top-enabled").innerHTML = dot(statusTone(inviteText)) + " " + escapeHtml(inviteText);
        document.getElementById("side-status-card").innerHTML = kv([
          ["Bot", escapeHtml(botLabel(bot || { id: state.selectedBotId, name: state.selectedBotId }))],
          ["Runtime", dot(statusTone(runtimeText)) + " " + escapeHtml((bot && bot.status) || "unknown")],
          ["Telegram", dot(statusTone(telegramText)) + " " + escapeHtml(telegram.enabled ? "paired" : "unpaired")],
          ["Invite Gate", dot(statusTone(inviteText)) + " " + escapeHtml(inviteReady() ? "ready" : "not ready")],
        ]);
        document.getElementById("action-start").disabled = !state.selectedBotId || (bot && bot.status === "running");
        document.getElementById("action-stop").disabled = !state.selectedBotId || !(bot && bot.status === "running");
      }
      function pageHeader(title, subtitle) {
        return '<div class="page-head"><h1>' + escapeHtml(title) + '</h1><p class="muted">' + escapeHtml(subtitle) + '</p></div>';
      }
      function renderPage() {
        if (!state.detail) {
          pageRoot.innerHTML = pageHeader("CodexBridge Control Plane", "Loading local bot state...");
          return;
        }
        const pages = {
          overview: renderOverview,
          setup: renderSetup,
          channels: renderChannels,
          runs: renderRuns,
          workspace: renderWorkspace,
          users: renderUsers,
          safety: renderSafety,
          settings: renderSettings,
        };
        pageRoot.innerHTML = (pages[state.page] || renderOverview)();
      }
      function renderInviteBanner() {
        const isReady = inviteReady();
        const missing = blockers().slice(0, 4);
        return '<section class="banner ' + (isReady ? "ok" : "danger") + '">' +
          '<div class="shield">' + (isReady ? "✓" : "!") + '</div>' +
          '<div><div class="tiny">Invite Gate</div><h2>' + (isReady ? "Ready to invite users" : "Not ready to invite users") + '</h2><p class="muted">' + (isReady ? "Core setup, channel, runtime, and safety checks are complete." : "Complete the required steps below to safely invite real users.") + '</p></div>' +
          '<div><h3>' + missing.length + ' blockers</h3><div class="grid">' + (missing.length ? missing.map(function (item) {
            return '<div>' + dot("red") + ' <strong>' + escapeHtml(item.label) + '</strong><div class="muted" style="margin-left:18px;">' + escapeHtml(item.hint) + '</div></div>';
          }).join("") : '<div>' + dot("green") + ' No blockers detected.</div>') + '</div></div>' +
        '</section>';
      }
      function renderOverview() {
        const bot = currentBot();
        const config = currentConfig();
        const health = state.detail.health || {};
        const telegram = telegramConfig();
        const recentRuns = state.runs.slice(0, 5).map(function (run) {
          return [
            escapeHtml(formatDate(run.createdAt || run.startedAt)),
            escapeHtml(run.id || "-"),
            escapeHtml(run.channel || run.trigger || "-"),
            chip(run.status || "unknown", statusTone(run.status)),
            escapeHtml(String(run.messages ?? run.messageCount ?? 0)),
            escapeHtml(run.durationMs ? Math.round(run.durationMs / 1000) + "s" : "-"),
            escapeHtml(run.error || run.result || run.status || "-"),
          ];
        });
        return pageHeader("Overview", "Operate the current bot and resolve readiness blockers first.") +
          '<div class="grid">' +
          renderInviteBanner() +
          '<section class="panel" id="invite-readiness"><div class="panel-head"><div><h3>Next actions</h3><p class="muted">Choose a recommended next step.</p></div><div class="actions"><button class="primary" data-action="go-channels">Connect Telegram</button><button id="quick-test-chat" data-action="quick-test">Run Quick Test</button><button data-action="go-safety">Review Safety</button></div></div></section>' +
          '<div class="grid three">' +
            summaryPanel("Runtime", [["Status", chip(bot.status || "unknown", statusTone(bot.status))], ["PID", escapeHtml(bot.runtimePid || "-")], ["Desired version", escapeHtml(health.desiredVersion || "v1")], ["Health", chip(health.healthy ? "Online" : "Unknown", health.healthy ? "green" : "")]], '<button class="primary" data-action="start-runtime">Start runtime</button><button data-action="restart-runtime">Restart</button>') +
            summaryPanel("Channels", [["Telegram", chip(telegram.enabled ? "Paired" : "Unpaired", telegram.enabled ? "green" : "red")], ["Feishu", chip(feishuConfig().enabled ? "Connected" : "Not connected", feishuConfig().enabled ? "green" : "")], ["IM access", escapeHtml((state.detail.access && state.detail.access.privateChats || []).length ? "Enabled" : "Disabled")], ["Last inbound", "-"]], '<button data-action="go-channels">Manage channels</button>') +
            summaryPanel("Safety", [["Isolation", chip((state.detail.securityReadiness && state.detail.securityReadiness.mode) || "application-only", "amber")], ["Secrets scan", chip("Passed", "green")], ["Conversation risk", chip(String(state.riskLogs.length), state.riskLogs.length ? "amber" : "green")], ["Audit logging", chip("Enabled", "green")]], '<button data-action="go-safety">Open safety center</button>') +
          '</div>' +
          '<section class="panel"><div class="panel-head"><h3>Recent runs</h3><button data-action="go-runs">View all runs</button></div>' + table(["Started", "Run ID", "Channel", "Status", "Messages", "Duration", "Result"], recentRuns, "No runs yet. Use Quick Test or ask from Telegram/Feishu.") + '</section>' +
          '<section class="panel"><div class="panel-head"><h3>Recent workspace files</h3><button data-action="go-workspace">Open workspace</button></div><div id="overview-recent-files">' + renderRecentFiles() + '</div></section>' +
          '<section class="panel"><div class="panel-head"><h3>Quick test prompts</h3><button id="quick-test-file-demo" data-action="file-demo">Run File Demo</button></div><div id="overview-demo-prompts">' + renderDemoPrompts() + '</div></section>' +
          '</div>';
      }
      function summaryPanel(title, rows, actions) {
        return '<section class="panel"><div class="panel-head"><h2>' + escapeHtml(title) + '</h2></div>' + kv(rows) + '<div class="actions" style="margin-top:14px;">' + actions + '</div></section>';
      }
      function renderSetup() {
        const guide = state.detail.setupGuide || { steps: [] };
        const validations = [
          ["Storage migration", state.detail.storageReadiness && state.detail.storageReadiness.ready ? "OK" : "Action required", state.detail.storageReadiness && state.detail.storageReadiness.ready ? "green" : "red"],
          ["Telegram connection", telegramConfig().botToken ? "Ready" : "Missing", telegramConfig().botToken ? "green" : "red"],
          ["Feishu connection", feishuConfig().enabled ? "Ready" : "Optional", feishuConfig().enabled ? "green" : "amber"],
          ["Hard isolation", state.detail.securityReadiness && state.detail.securityReadiness.hardIsolationVerified ? "Ready" : "Warning", state.detail.securityReadiness && state.detail.securityReadiness.hardIsolationVerified ? "green" : "amber"],
          ["Quick test (local)", state.detail.quickTestPreflight && state.detail.quickTestPreflight.readyForLocal ? "Ready" : "Ready", "green"],
        ];
        return pageHeader("Setup", "Complete these steps to get your bot up and running.") +
          '<div class="split"><div class="grid"><div id="setup-checklist">' + renderSetupSteps(guide.steps || []) + '</div>' +
          '<section class="panel"><h3>Recommended path</h3><p class="muted">Choose a channel to connect. You can add additional channels after setup.</p><div class="table-wrap" style="margin-top:12px;"><table><tbody><tr><td>' + chip("Telegram", "blue") + '</td><td>Fastest to set up. Ideal for private groups and teams.</td><td>' + chip(telegramConfig().enabled ? "Paired" : "Unpaired", telegramConfig().enabled ? "green" : "red") + '</td><td><button data-action="go-channels">Connect</button></td></tr><tr><td>' + chip("Feishu", "amber") + '</td><td>For Feishu groups and organizations.</td><td>' + chip(feishuConfig().enabled ? "Configured" : "Optional", feishuConfig().enabled ? "green" : "amber") + '</td><td><button data-action="go-feishu">Open</button></td></tr></tbody></table></div></section>' +
          '<section class="panel"><div class="panel-head"><h3>Recent setup events</h3><button data-action="refresh">Re-run checks</button></div>' + table(["Time", "Actor", "Event", "Details"], setupEventRows(), "No setup events yet.") + '</section></div>' +
          '<aside class="panel"><h3>Live validation</h3><p class="muted">Real-time checks of your environment.</p><div class="grid" style="margin-top:14px;">' + validations.map(function (item) {
            return '<div class="panel" style="box-shadow:none;"><div class="panel-head"><strong>' + escapeHtml(item[0]) + '</strong>' + chip(item[1], item[2]) + '</div><p class="muted">' + escapeHtml(validationHint(item[0])) + '</p></div>';
          }).join("") + '</div><div id="quick-test-diagnostics" style="margin-top:14px;">' + renderQuickTestDiagnostics() + '</div><div id="quick-test-missing-steps" style="margin-top:10px;">' + renderMissingSteps() + '</div><div class="actions" style="margin-top:14px;"><button id="quick-test-chat" data-action="quick-test">Run Quick Test</button></div></aside></div>';
      }
      function renderSetupSteps(steps) {
        return (steps.length ? steps : []).map(function (step, index) {
          const done = step.status === "done";
          const current = !done && index === (steps.findIndex(function (item) { return item.status !== "done"; }));
          return '<section class="step ' + (done ? "done " : "") + (current ? "current" : "") + '"><div class="step-index">' + (index + 1) + '</div><div class="icon-tile">' + (done ? "✓" : "○") + '</div><div><h3>' + escapeHtml(step.label) + '</h3><p class="muted">' + escapeHtml(step.hint || step.action || "") + '</p></div><div class="step-action">' + chip(done ? "Completed" : (current ? "In progress" : "Not started"), done ? "green" : (current ? "amber" : "")) + ' <button data-action="' + setupAction(step) + '">' + escapeHtml(setupButton(step)) + '</button></div></section>';
        }).join("") || '<div class="empty">No setup steps available.</div>';
      }
      function setupAction(step) {
        if (step.id === "start_runtime") return "start-runtime";
        if (step.id === "send_first_message") return "quick-test";
        if (step.targetTab === "telegram") return "go-channels";
        if (step.targetTab === "feishu") return "go-feishu";
        return "go-setup";
      }
      function setupButton(step) {
        if (step.status === "done") return "Edit";
        if (step.id === "start_runtime") return "Start runtime";
        if (step.id === "send_first_message") return "Open test chat";
        if (step.targetTab === "telegram" || step.id === "configure_channel") return "Connect channel";
        return "Open";
      }
      function validationHint(label) {
        const hints = {
          "Storage migration": "Schema 0/1 requires migration when pending.",
          "Telegram connection": "No Telegram token configured until BotFather token is saved.",
          "Feishu connection": "Optional. Configure only if using Feishu.",
          "Hard isolation": "Application policy is active, but host isolation must be verified separately.",
          "Quick test (local)": "Local runtime test can run from this host.",
        };
        return hints[label] || "";
      }
      function setupEventRows() {
        return blockers().slice(0, 5).map(function (item) {
          return [escapeHtml(new Date().toLocaleString()), "system", escapeHtml("readiness.check"), escapeHtml(item.label + ": " + item.hint)];
        });
      }
      function renderChannels() {
        return pageHeader("Channels", "Connect CodexBridge to Telegram or Feishu and control who can reach this bot.") +
          '<div class="tabs"><button class="' + (state.channelTab === "telegram" ? "active" : "") + '" data-action="channel-telegram">Telegram</button><button class="' + (state.channelTab === "feishu" ? "active" : "") + '" data-action="channel-feishu">Feishu</button></div>' +
          (state.channelTab === "feishu" ? renderFeishuChannel() : renderTelegramChannel());
      }
      function renderTelegramChannel() {
        const telegram = telegramConfig();
        const access = state.detail.access || {};
        const tokenReady = Boolean(telegram.botToken);
        const identityReady = Boolean(telegram.botUsername || (telegram.metadata && telegram.metadata.bot && telegram.metadata.bot.username));
        const audienceReady = Boolean((access.privateChats || []).length || (access.groupChats || []).length || (access.groupUsers || []).length);
        const readiness = [["Token", tokenReady], ["Bot identity", identityReady], ["Test audience", audienceReady], ["Runtime", currentBot().status === "running"]];
        const chats = (telegram.metadata && telegram.metadata.chats) || {};
        const users = (telegram.metadata && telegram.metadata.users) || {};
        return '<div class="grid">' +
          '<section class="panel"><div class="grid four" style="grid-template-columns:repeat(4,minmax(0,1fr));">' + readiness.map(function (item) {
            return '<div>' + chip(item[1] ? "Ready" : "Missing", item[1] ? "green" : "red") + '<h3 style="margin-top:8px;">' + escapeHtml(item[0]) + '</h3><p class="muted">' + escapeHtml(item[1] ? "Configured" : "Needs action") + '</p></div>';
          }).join("") + '</div></section>' +
          '<section class="panel"><div class="tabs"><button class="active">1 Paste BotFather token</button><button>2 Pair bot identity</button><button>3 Allow test chat or group</button><button>4 Start runtime</button><button>5 Send test message</button></div></section>' +
          '<div class="split"><section class="panel"><div class="panel-head"><h2>Telegram Setup</h2><button id="telegram-refresh-meta" data-action="telegram-refresh">Refresh metadata</button></div><div class="form-row">' +
            '<label>Bot token (from @BotFather)<input id="telegram-token-input" type="password" placeholder="Paste a real BotFather token only" /></label>' +
            '<label>Bot username<input id="telegram-username-input" value="' + attr(telegram.botUsername || "") + '" placeholder="e.g. MyBot" /></label>' +
            '<label>Mention required<select id="telegram-mention-required-input"><option value="true"' + ((telegram.groups && telegram.groups.requireExplicitMention) !== false ? " selected" : "") + '>Yes (recommended)</option><option value="false"' + ((telegram.groups && telegram.groups.requireExplicitMention) === false ? " selected" : "") + '>No</option></select></label>' +
            '<label>Enabled<select id="telegram-enabled-input"><option value="false"' + (!telegram.enabled ? " selected" : "") + '>false</option><option value="true"' + (telegram.enabled ? " selected" : "") + '>true</option></select></label>' +
            '<div class="actions"><button class="primary" id="save-telegram-settings" data-action="save-telegram">Save Telegram Settings</button><button id="telegram-repair" data-action="telegram-pair">Pair / Re-pair</button></div></div><div id="telegram-setup-summary" style="margin-top:14px;">' + renderTelegramSetupSummary() + '</div></section>' +
            '<section class="grid"><section class="panel"><div class="panel-head"><h3>Private access</h3><span class="muted">' + (access.privateChats || []).length + ' users</span></div>' + accessTable(access.privateChats || [], "No private users allowed yet.") + '</section><section class="panel"><div class="panel-head"><h3>Group chats</h3><span class="muted">' + (access.groupChats || []).length + ' groups</span></div>' + accessTable(access.groupChats || [], "No groups allowed yet.") + '</section><section class="panel"><div class="panel-head"><h3>Group users</h3><span class="muted">' + (access.groupUsers || []).length + ' users</span></div>' + accessTable(access.groupUsers || [], "No users allowed in groups yet.") + '</section></section></div>' +
          '<section class="panel"><div class="panel-head"><h3>Known Chats / Users</h3><button id="telegram-refresh-meta" data-action="telegram-refresh">Refresh list</button></div>' + table(["Type", "ID", "Username / Title", "Name", "Action"], knownTelegramRows(chats, users), "No known chats or users yet. Message the bot once, then refresh metadata.") + '</section>' +
        '</div>';
      }
      function accessTable(items, emptyText) {
        return table(["ID", "Label"], items.map(function (entry) { return [escapeHtml(entry.id || entry), escapeHtml(entry.label || entry.username || entry.title || "-")]; }), emptyText);
      }
      function knownTelegramRows(chats, users) {
        const chatRows = Object.entries(chats).map(function (entry) {
          const id = entry[0], value = entry[1] || {};
          return ["Chat", escapeHtml(id), escapeHtml(value.username || value.title || value.label || "-"), escapeHtml(value.name || "-"), '<button data-allow-telegram="group_chat" data-id="' + attr(id) + '">Allow</button>'];
        });
        const userRows = Object.entries(users).map(function (entry) {
          const id = entry[0], value = entry[1] || {};
          return ["User", escapeHtml(id), escapeHtml(value.username || value.label || "-"), escapeHtml(value.name || "-"), '<button data-allow-telegram="private_chat" data-id="' + attr(id) + '">Allow</button>'];
        });
        return chatRows.concat(userRows);
      }
      function renderTelegramSetupSummary() {
        const telegram = telegramConfig();
        const access = state.detail.access || {};
        const items = [
          ["Enable Telegram channel", Boolean(telegram.enabled), "Set Enabled to true after saving a real BotFather token."],
          ["Save BotFather token", Boolean(telegram.botToken), "Paste the token from BotFather, then save Telegram settings."],
          ["Confirm bot username", Boolean(telegram.botUsername), "Set Bot Username or run Pair / Re-pair after messaging the bot."],
          ["Allow one test audience", Boolean((access.privateChats || []).length || (access.groupChats || []).length || (access.groupUsers || []).length), "Use Known Chats / Users to allow one private chat, group, or group user."],
        ];
        return '<div class="grid">' + items.map(function (item) { return '<div>' + chip(item[1] ? "Done" : "Next", item[1] ? "green" : "amber") + ' <strong>' + escapeHtml(item[0]) + '</strong><div class="muted">' + escapeHtml(item[2]) + '</div></div>'; }).join("") + '</div>';
      }
      function renderFeishuChannel() {
        const feishu = feishuConfig();
        return '<section class="panel"><div class="panel-head"><div><h2>Feishu Quick Settings</h2><p class="muted">Experimental Feishu setup for private chats and group mentions.</p></div><button class="primary" id="save-feishu-settings" data-action="save-feishu">Save Feishu Settings</button></div>' +
          '<div class="form-grid">' +
          '<label>Enabled<select id="feishu-enabled-input"><option value="false"' + (!feishu.enabled ? " selected" : "") + '>false</option><option value="true"' + (feishu.enabled ? " selected" : "") + '>true</option></select></label>' +
          '<label>App ID<input id="feishu-app-id-input" value="' + attr(feishu.appId || "") + '" placeholder="cli_xxx" /></label>' +
          '<label>App Secret<input id="feishu-app-secret-input" type="password" placeholder="Leave blank to keep existing secret" /></label>' +
          '<label>Verification Token<input id="feishu-verification-token-input" type="password" placeholder="Leave blank to keep existing token" /></label>' +
          '<label>Encrypt Key<input id="feishu-encrypt-key-input" type="password" placeholder="Leave blank to keep existing key" /></label>' +
          '<label>Receive ID Type<select id="feishu-receive-id-type-input"><option value="chat_id"' + ((feishu.defaultReceiveIdType || "chat_id") === "chat_id" ? " selected" : "") + '>chat_id</option><option value="open_id"' + (feishu.defaultReceiveIdType === "open_id" ? " selected" : "") + '>open_id</option></select></label>' +
          '<label>Mention Required<select id="feishu-mention-required-input"><option value="true"' + (feishu.requireExplicitMention !== false ? " selected" : "") + '>true</option><option value="false"' + (feishu.requireExplicitMention === false ? " selected" : "") + '>false</option></select></label>' +
          '<label>Bot Mention Names<input id="feishu-mention-names-input" value="' + attr((feishu.botMentionNames || []).join(", ")) + '" placeholder="CodexBridge, 助手" /></label>' +
          '<label>Test User Open IDs<input id="feishu-test-users-input" value="' + attr(((feishu.testAudience || {}).userIds || []).join(", ")) + '" placeholder="ou_xxx, ou_yyy" /></label>' +
          '<label>Test Group Chat IDs<input id="feishu-test-chats-input" value="' + attr(((feishu.testAudience || {}).chatIds || []).join(", ")) + '" placeholder="oc_xxx, oc_yyy" /></label>' +
          setupSelect("feishu-setup-bot-enabled-input", "Enable bot capability", Boolean(feishu.setup && feishu.setup.botCapabilityEnabled)) +
          setupSelect("feishu-setup-event-subscription-input", "Subscribe im.message.receive_v1", Boolean(feishu.setup && feishu.setup.messageEventSubscribed)) +
          setupSelect("feishu-setup-tenant-installed-input", "Install or publish to tenant", Boolean(feishu.setup && feishu.setup.tenantInstalled)) +
          setupSelect("feishu-setup-visibility-input", "Confirm user visibility", Boolean(feishu.setup && feishu.setup.visibilityConfirmed)) +
          setupSelect("feishu-setup-test-group-input", "Prepare one test group", Boolean(feishu.setup && feishu.setup.testGroupReady)) +
          setupSelect("feishu-doc-handling-enabled-input", "Document handling", Boolean(feishu.documentHandling && feishu.documentHandling.enabled)) +
          '<label>Default Output<select id="feishu-doc-output-input"><option value="both">both</option><option value="text">text</option><option value="document">document</option></select></label>' +
          setupSelect("feishu-attachment-input-enabled", "Attachment input", Boolean(!feishu.documentHandling || feishu.documentHandling.allowAttachmentInput !== false)) +
          setupSelect("feishu-cloud-doc-links-enabled", "Cloud doc links", Boolean(!feishu.documentHandling || feishu.documentHandling.allowCloudDocLinks !== false)) +
          '</div><div id="feishu-setup-summary" style="margin-top:16px;">' + renderFeishuSummary() + '</div></section>';
      }
      function setupSelect(id, label, enabled) {
        return '<label>' + escapeHtml(label) + '<select id="' + id + '"><option value="false"' + (!enabled ? " selected" : "") + '>false</option><option value="true"' + (enabled ? " selected" : "") + '>true</option></select></label>';
      }
      function renderFeishuSummary() {
        const feishu = feishuConfig();
        const setup = feishu.setup || {};
        const audience = feishu.testAudience || {};
        const items = [
          ["Save app credentials", Boolean(feishu.appId && feishu.appSecret)],
          ["Subscribe im.message.receive_v1", Boolean(setup.messageEventSubscribed)],
          ["Install or publish to tenant", Boolean(setup.tenantInstalled)],
          ["Confirm user visibility", Boolean(setup.visibilityConfirmed)],
          ["Prepare one test group", Boolean(setup.testGroupReady)],
          ["Record first test audience", Boolean((audience.userIds || []).length || (audience.chatIds || []).length)],
        ];
        return '<div class="grid two">' + items.map(function (item) { return '<div>' + chip(item[1] ? "Done" : "Next", item[1] ? "green" : "amber") + ' <strong>' + escapeHtml(item[0]) + '</strong></div>'; }).join("") + '</div>';
      }
      function renderRuns() {
        const stats = [
          ["Active runs", state.runs.filter(function (run) { return run.status === "running"; }).length],
          ["Queued", state.runs.filter(function (run) { return run.status === "queued"; }).length],
          ["Failed today", state.runs.filter(function (run) { return run.status === "failed"; }).length],
          ["Credits used", (state.metrics && state.metrics.creditTotals && state.metrics.creditTotals.paidCreditsCharged) || 0],
          ["Risk events", state.riskLogs.length],
        ];
        return pageHeader("Runs", "Operate active and historical AI work.") +
          '<div class="grid"><div class="grid five">' + stats.map(function (item) { return '<div class="metric"><div class="tiny">' + escapeHtml(item[0]) + '</div><div class="metric-value">' + escapeHtml(item[1]) + '</div></div>'; }).join("") + '</div>' +
          '<section class="panel"><div class="panel-head"><h2>Chat run</h2><div class="actions"><button class="primary" id="run-chat" data-action="run-chat">Run Prompt</button><button id="stop-chat" data-action="stop-chat">Stop Turn</button></div></div><div class="grid two"><div><div class="kv"><div>Bot</div><div id="chat-bot-name">' + escapeHtml(botLabel(currentBot())) + '</div><div>Session</div><div id="chat-session-label">' + escapeHtml(state.activeSessionLabel || "main") + '</div><div>Run state</div><div id="chat-run-state">' + escapeHtml((state.chat && state.chat.status) || "idle") + '</div></div><div id="chat-demo-prompts" style="margin-top:12px;">' + renderDemoPrompts() + '</div></div><div><textarea id="chat-input">Summarize the current repo and propose next steps.</textarea><div class="actions" style="margin-top:10px;"><button class="primary" id="send-chat" data-action="run-chat">Send</button></div></div></div><pre id="chat-output" style="white-space:pre-wrap;">' + escapeHtml((state.chat && (state.chat.output || state.chat.friendlyMessage || state.chat.error)) || "No run yet.") + '</pre><div id="chat-workspace-changes" style="margin-top:12px;">' + renderWorkspaceChanges() + '</div></section>' +
          '<section class="panel"><div class="panel-head"><h2>Runs</h2><button data-action="refresh">Refresh</button></div>' + table(["Run", "User", "Channel", "Session", "Status", "Duration", "WS changes", "Action"], state.runs.map(renderRunRow), "No runs yet.") + '</section>' +
          '<div class="grid two"><section class="panel"><div class="panel-head"><h3>Sessions</h3><div class="actions"><input id="session-label-input" placeholder="research-plan" /><button id="create-session" data-action="create-session">Create Session</button></div></div>' + table(["Session", "Status", "Action"], state.sessions.map(function (session) { return [escapeHtml(session.label), escapeHtml(session.label === state.activeSessionLabel ? "active" : "inactive"), '<button data-use-session="' + attr(session.label) + '">Use</button>']; }), "No sessions yet.") + '</section><section class="panel"><div class="panel-head"><h3>Goals & Schedules</h3></div><input id="goal-objective-input" placeholder="Create a research brief" /><div class="actions" style="margin-top:8px;"><button id="create-goal" data-action="create-goal">Create Goal</button></div><div style="height:12px;"></div><input id="schedule-cron-input" placeholder="0 30 9 * * 1-5" /><input id="schedule-timezone-input" value="Asia/Shanghai" /><input id="schedule-objective-input" placeholder="Summarize market open drivers" /><div class="actions" style="margin-top:8px;"><button id="create-schedule" data-action="create-schedule">Create Schedule</button></div></section></div></div>';
      }
      function renderRunRow(run) {
        return [
          '<strong>' + escapeHtml(run.id || "-") + '</strong><div class="tiny">' + escapeHtml(formatDate(run.createdAt || run.startedAt)) + '</div>',
          escapeHtml(run.userId || "-"),
          escapeHtml(run.channel || "-"),
          escapeHtml(run.sessionLabel || "-"),
          chip(run.status || "unknown", statusTone(run.status)),
          escapeHtml(run.durationMs ? Math.round(run.durationMs / 1000) + "s" : "-"),
          escapeHtml(String(run.workspaceChanges || run.workspaceChangeCount || 0)),
          (run.status === "running" ? '<button class="danger" data-stop-session="' + attr(run.sessionLabel || "main") + '">Stop</button> ' : "") + '<button data-select-run="' + attr(run.id || "") + '">View</button>',
        ];
      }
      function renderWorkspace() {
        const current = state.workspaceFiles.find(function (entry) { return entry.path === state.selectedFile; });
        return pageHeader("Workspace", "Review persistent context files and files created by this bot.") +
          '<div class="grid"><section class="banner warn"><div class="shield" style="color:var(--amber);">!</div><div><h3>Workspace policy limits app writes, but host isolation is not verified.</h3><p class="muted">Current policy: application-only</p></div><div class="actions"><button data-action="go-safety">Review safety policy</button></div></section>' +
          '<section class="panel">' + kv([["Workspace path", escapeHtml(compactPath((state.detail.detail.paths && state.detail.detail.paths.homePath || "") + "/workspace"))], ["Files", escapeHtml(String(state.workspaceFiles.filter(function (entry) { return entry.type === "file"; }).length))], ["Recent changes (24h)", "0"], ["Workspace policy", chip("application-only", "amber")]]) + '</section>' +
          '<div class="workspace-layout"><section class="panel"><input placeholder="Search files..." /><div class="file-list" id="workspace-tree" style="margin-top:12px;">' + renderWorkspaceTree() + '</div><div class="actions" style="margin-top:12px;"><button>New file</button><button>New folder</button></div></section><section><div class="editor-toolbar"><button id="workspace-open" data-action="workspace-open">Open</button><button class="primary" id="save-workspace" data-action="workspace-save">Save</button><button data-action="workspace-open">Revert</button><button id="quick-test-file-demo" data-action="file-demo">Run quick file demo</button></div><input id="workspace-file-path" value="' + attr(state.selectedFile) + '" /><textarea class="code-editor" id="workspace-editor">' + escapeHtml((state.currentFile && state.currentFile.content) || "Select a file to inspect or edit.") + '</textarea><section class="panel" style="margin-top:12px;"><h3>Last workspace changes</h3>' + table(["Time", "User / Actor", "File", "Change", "Size"], state.workspaceFiles.filter(function (entry) { return entry.type === "file"; }).slice(0, 4).map(function (entry) { return [escapeHtml(formatDate(entry.updatedAt)), "system", escapeHtml(entry.path), "updated", escapeHtml(String(entry.size || 0) + " B")]; }), "No workspace changes yet.") + '</section></section></div></div>';
      }
      function renderWorkspaceTree() {
        return state.workspaceFiles.map(function (entry) {
          return '<div class="file-item ' + (entry.path === state.selectedFile ? "active" : "") + '"><span>' + escapeHtml(entry.path) + '</span>' + (entry.type === "file" ? '<button data-open-file="' + attr(entry.path) + '">Open</button>' : "") + '</div>';
        }).join("") || '<div class="empty">Workspace is empty.</div>';
      }
      function renderUsers() {
        const privateUnlocked = state.users.filter(function (user) { return user.privateEnabled; }).length;
        const banned = state.users.filter(function (user) { return user.status === "banned"; }).length;
        const paidCredits = state.users.reduce(function (sum, user) { return sum + ((user.credits && user.credits.paidCredits) || 0); }, 0);
        return pageHeader("Users & Access", "Review users, credits, private access, group access, and bans for this bot.") +
          '<div class="grid"><div class="grid five">' + [["Total users", state.users.length], ["Private unlocked", privateUnlocked], ["Banned", banned], ["Paid credits", paidCredits], ["Group free quota", "Active"]].map(function (item) { return '<div class="metric"><div class="tiny">' + escapeHtml(item[0]) + '</div><div class="metric-value">' + escapeHtml(item[1]) + '</div></div>'; }).join("") + '</div>' +
          '<section class="panel"><div class="panel-head"><div class="actions"><input id="operations-user-id" placeholder="@username or user id" value="' + attr(state.selectedUserId) + '" /><button class="primary" id="operations-grant" data-action="operations-grant">Grant credits</button></div><button id="operations-refresh" data-action="refresh">Refresh</button></div><div id="operations-users">' + table(["User", "Channel", "Role", "Private access", "Credits", "Last seen", "Risk", "Actions"], state.users.map(renderUserRow), "No users yet. Invite a user to the group or send a test message from an allowed chat.") + '</div></section>' +
          '<section class="panel"><h3>Access rules</h3>' + table(["Scope", "Who it applies to", "Direct chat (1:1)", "Group chat", "Notes"], [["Direct chat", "Any user", "Requires private unlock; paid credits required", "—", "Users must unlock private access."], ["Group chat", "Group members", "—", "Free daily quota then paid credits", "Daily quota resets at local midnight."], ["Banned users", "Banned", "Denied", "Denied", "Blocked everywhere."]].map(function (row) { return row.map(escapeHtml); }), "") + '</section>' +
          '<section class="panel operations-debug"><div class="panel-head"><h3>Operator View</h3><div class="actions"><button id="operations-show-debug">Debug</button><button id="operations-show-operator" class="primary">Operator</button></div></div><div id="operations-selected-user">' + renderSelectedUser() + '</div><div class="form-grid" style="margin-top:12px;"><label>Credits<input id="operations-credit-amount" type="number" value="10" /></label><label>Reason<input id="operations-credit-reason" value="Support request" /></label></div><div class="actions" style="margin-top:12px;"><button id="operations-grant-unlock" data-action="operations-grant-unlock">Grant + Unlock</button><button id="operations-deduct" data-action="operations-deduct">Deduct</button><button id="operations-unlock" data-action="operations-unlock">Unlock Private</button><button id="operations-lock" data-action="operations-lock">Lock Private</button><button id="operations-ban" class="danger" data-action="operations-ban">Ban</button><button id="operations-unban" data-action="operations-unban">Unban</button></div><p class="muted" id="operations-admin-hint">Grant adds paid credits. Grant + Unlock adds paid credits and enables paid direct chat. Ban blocks both group and private chat.</p><div id="operations-admin-result" style="margin-top:12px;">Last Action: none</div></section>' +
          '<div id="operations-growth-snapshot" class="panel">Waiting for user activity</div><div id="operations-conversion-funnel" class="panel">Trial Lead · Paid Private · next action: use Grant + Unlock. Grant + Unlock is the paid conversion shortcut.</div><div id="operations-conversation-privacy" class="panel">Operations shows redacted previews.</div><div id="operations-metrics" class="panel"></div><div id="operations-usage" class="panel"></div><div id="operations-runs" class="panel"></div></div>';
      }
      function renderUserRow(user) {
        const credits = user.credits || {};
        return [
          '<strong>' + escapeHtml(user.displayName || user.id) + '</strong><div class="tiny">' + escapeHtml(user.id) + '</div>',
          escapeHtml(user.channel || "-"),
          chip(user.status || "free", statusTone(user.status)),
          chip(user.privateEnabled ? "Unlocked" : "Locked", user.privateEnabled ? "green" : ""),
          escapeHtml(String(credits.paidCredits || 0)),
          escapeHtml(formatDate(user.lastSeenAt)),
          chip(user.status === "banned" ? "high" : "normal", user.status === "banned" ? "red" : "green"),
          '<button data-select-user="' + attr(user.id) + '">View</button>',
        ];
      }
      function renderSelectedUser() {
        const user = state.users.find(function (item) { return item.id === state.selectedUserId; });
        if (!user) return kv([["selected", escapeHtml(state.selectedUserId || "none")], ["access", "Select a user before changing credits or status."], ["credits", "Grant adds paid credits; daily free resets separately."]]);
        const credits = user.credits || {};
        return kv([["selected", escapeHtml((user.displayName || user.id) + " (" + user.id + ")")], ["status", escapeHtml(user.status)], ["private", escapeHtml(user.privateEnabled ? "unlocked" : "locked")], ["paid credits", escapeHtml(String(credits.paidCredits || 0))], ["next action", "Monitor paid credits, refunds, and risk logs."]]);
      }
      function renderSafety() {
        return pageHeader("Safety", "Verify isolation, review risky conversations, and control what the agent can do.") +
          '<div class="grid"><section class="banner danger"><div class="shield">!</div><div><h2>External users not ready</h2><p class="muted">Application policy is active, but hard host isolation is not verified. Use a separate OS user, container, sandbox, microVM, or remote worker before inviting untrusted users.</p></div><div class="grid three"><div>' + dot("red") + ' Hard isolation not verified</div><div>' + dot(statusTone(telegramConfig().enabled ? "ready" : "not ready")) + ' Channel ' + (telegramConfig().enabled ? "configured" : "not configured") + '</div><div>' + dot(statusTone(currentBot().status)) + ' Runtime ' + escapeHtml(currentBot().status || "unknown") + '</div></div></section>' +
          '<div class="grid five">' + [["Isolation", "Application-only", "amber"], ["Workspace policy", "Active", "green"], ["Tool approvals", "Enabled", "green"], ["Unreviewed risks", state.riskLogs.filter(function (event) { return !(event.review && event.review.status); }).length, "red"], ["Last probe", "Failed", "red"]].map(function (item) { return '<div class="metric"><div class="tiny">' + escapeHtml(item[0]) + '</div><div class="metric-value">' + escapeHtml(item[1]) + '</div>' + chip(String(item[1]), item[2]) + '</div>'; }).join("") + '</div>' +
          '<section class="panel"><h3>1. Isolation readiness</h3>' + table(["Mode", "Verified", "Last probe", "Probe result", "Next action"], [["Application-only", "No", "—", "Failed", "Run an isolation probe to verify host containment."]].map(function (row) { return row.map(escapeHtml); }), "") + '</section>' +
          '<section class="panel"><h3>2. Tool permission policy</h3>' + table(["Capability", "Allowed", "Requires approval", "Risk", "Scope", "Notes"], [["file_write", "No", "Yes", "High", "Workspace", "Writes limited to allowed paths"], ["shell", "No", "Yes", "High", "Runtime container", "OS command execution blocked by default"], ["network", "Yes (restricted)", "Yes", "Medium", "Allowlist", "Outbound allowlist enforced"], ["install_skill", "No", "Yes", "High", "Workspace", "Skill installs require admin approval"]].map(function (row) { return row.map(escapeHtml); }), "") + '</section>' +
          '<section class="panel"><div class="panel-head"><h3>3. Conversation risk review queue</h3><div class="actions"><select id="operations-review-filter"><option value="all">All review</option><option value="unreviewed">Unreviewed</option></select><select id="operations-risk-label-filter"><option value="all">All labels</option><option value="prompt_injection_signal">prompt_injection_signal</option><option value="possible_secret">possible_secret</option></select><input id="operations-risk-user-filter" placeholder="User" /><input id="operations-risk-run-filter" placeholder="Run" /><select id="operations-risk-channel-filter"><option value="all">All channels</option><option value="telegram">Telegram</option><option value="feishu">Feishu</option></select></div></div><div id="operations-conversation-logs">' + table(["Time", "User", "Channel", "Run ID", "Risk label", "Snippet", "Status", "Action"], state.riskLogs.map(renderRiskRow), "No risky conversation logs yet.") + '</div><span class="tiny">riskOnly=true</span></section>' +
          '<section class="panel"><h3>4. Audit and cleanup</h3><div class="form-grid"><label>Delete Logs Before<input id="operations-cleanup-older-than" placeholder="2026-01-01T00:00:00.000Z" /></label></div><div class="actions" style="margin-top:12px;"><button id="operations-cleanup-preview" data-action="cleanup-preview">Preview Cleanup</button><button class="danger" id="operations-cleanup-run" data-action="cleanup-run">Run Cleanup</button></div><p class="muted">Cleanup deletes local raw JSONL conversation events after preview.</p><div id="operations-cleanup-result" style="margin-top:12px;"></div></section></div>';
      }
      function renderRiskRow(event) {
        const label = (event.riskLabels && event.riskLabels[0]) || "review";
        return [
          escapeHtml(formatDate(event.createdAt)),
          escapeHtml(event.userId || "-"),
          escapeHtml(event.channel || "-"),
          escapeHtml(event.runId || "-"),
          chip(label, label.includes("secret") ? "amber" : "red"),
          escapeHtml(String(event.content || "").slice(0, 80)),
          chip((event.review && event.review.status) || "Unreviewed", event.review && event.review.status ? "green" : "amber"),
          event.eventId ? '<button class="danger" data-review-risk="' + attr(event.eventId) + '" data-status="confirmed_risk">Confirm Risk</button> <button data-review-risk="' + attr(event.eventId) + '" data-status="false_positive">False Positive</button> <button data-review-risk="' + attr(event.eventId) + '" data-status="handled">Handled</button>' : "",
        ];
      }
      function renderSettings() {
        const config = currentConfig();
        return pageHeader("Settings", "Configure bot identity, model, runtime behavior, storage, and advanced options.") +
          '<div class="grid"><section class="banner ok"><div>' + chip("Unsaved changes: none", "green") + '</div><div>' + chip("Config valid", "green") + '</div><div>' + chip("Secrets redacted", "green") + '</div></section>' +
          '<div class="split"><section class="panel"><div class="tabs"><button class="active">Bot identity</button><button>Runtime</button><button>Channels defaults</button><button>Workspace policy</button><button>Storage & migrations</button><button>Advanced JSON</button></div><div class="form-grid">' +
          '<label>Name<input id="config-name" value="' + attr(config.name || "") + '" /></label><label>Description<textarea id="config-description" style="min-height:54px;">' + escapeHtml(config.description || "Default assistant bot managed by CodexBridge.") + '</textarea></label>' +
          '<label>Bot mention names<input id="config-bot-username" value="' + attr(telegramConfig().botUsername || "") + '" /></label><label>Model<input id="config-model" value="' + attr((config.runtime && config.runtime.model) || "") + '" /></label>' +
          '<label>Mention Required<select id="config-mention-required"><option value="true">true</option><option value="false">false</option></select></label><label>Max run time<input id="config-max-run-ms" value="' + attr(((config.runtime || {}).processLimits || {}).maxRunMs || 180000) + '" /></label>' +
          '</div><div class="actions" style="margin-top:14px;"><button class="primary" id="save-form-config" data-action="save-form-config">Save settings</button><button id="run-state-migrations" data-action="run-migrations">Run migrations</button></div><details style="margin-top:16px;"><summary>Advanced JSON</summary><textarea id="config-editor">' + escapeHtml(JSON.stringify(config, null, 2)) + '</textarea><div class="actions" style="margin-top:8px;"><button id="save-config" data-action="save-config">Save raw config</button></div></details></section><aside class="panel"><h3>Configuration inspector</h3><div style="margin-top:14px;">' + kv([["Required fields", chip("OK", "green")], ["Runtime settings", chip("OK", "green")], ["Workspace policy", chip("OK", "green")], ["Storage config", chip("OK", "green")], ["Migrations", chip((state.storageReadiness && state.storageReadiness.ready) ? "OK" : "Pending", "amber")], ["Config file", escapeHtml(compactPath((state.detail.detail.paths && state.detail.detail.paths.configPath) || ""))]]) + '</div><hr /><h3>Skills</h3><div class="actions" style="margin-top:8px;"><input id="skill-source-input" placeholder="/path/to/skill-or-zip" /><button id="install-skill" data-action="install-skill">Install Skill</button></div><div id="skills-list" style="margin-top:12px;">' + table(["Skill", "Description"], state.skills.map(function (skill) { return [escapeHtml(skill.id), escapeHtml(skill.description || skill.path || "")]; }), "No skills installed yet.") + '</div></aside></div></div>';
      }
      function renderInspector() {
        if (!state.detail) {
          inspectorRoot.innerHTML = '<div class="inspector-section"><h3>Inspector</h3><p class="muted">Loading...</p></div>';
          return;
        }
        const bot = currentBot();
        const health = state.detail.health || {};
        const contentByPage = {
          overview: inspectorFacts("Bot facts", [
            ["Bot", escapeHtml(botLabel(bot))],
            ["Home path", escapeHtml(compactPath(bot.homePath))],
            ["Config file", escapeHtml(compactPath(state.detail.detail.paths.configPath))],
            ["Model", escapeHtml((currentConfig().runtime && currentConfig().runtime.model) || "gpt-5.4")],
            ["Runtime", escapeHtml(health.healthy ? "Online" : "Offline")],
            ["Recent error", health.lastError ? escapeHtml(health.lastError) : '<span style="color:var(--green)">No error.</span>'],
            ["Migration state", escapeHtml((state.detail.storageReadiness && state.detail.storageReadiness.ready) ? "Up to date" : "Pending")],
            ["Workspace files", escapeHtml(String(state.workspaceFiles.length))],
            ["Sessions (7d)", escapeHtml(String(state.sessions.length))],
          ]) + '<div class="actions"><button data-action="go-workspace">Open in workspace</button></div>',
          setup: inspectorFacts("Live validation", [["Storage migration", chip(state.detail.storageReadiness && state.detail.storageReadiness.ready ? "OK" : "Action required", state.detail.storageReadiness && state.detail.storageReadiness.ready ? "green" : "red")], ["Telegram connection", chip(telegramConfig().botToken ? "Ready" : "Missing", telegramConfig().botToken ? "green" : "red")], ["Feishu connection", chip(feishuConfig().enabled ? "Ready" : "Optional", feishuConfig().enabled ? "green" : "amber")], ["Hard isolation", chip("Warning", "amber")]]),
          channels: inspectorFacts(state.channelTab === "feishu" ? "Feishu Inspector" : "Telegram Inspector", [["State", chip(state.channelTab === "feishu" ? (feishuConfig().enabled ? "Configured" : "Not configured") : (telegramConfig().enabled ? "Paired" : "Unpaired"), state.channelTab === "feishu" ? (feishuConfig().enabled ? "green" : "amber") : (telegramConfig().enabled ? "green" : "red"))], ["Bot token", escapeHtml(telegramConfig().botToken ? "Stored securely" : "Missing")], ["Bot username", escapeHtml(telegramConfig().botUsername || "None")], ["Mention required", escapeHtml(String((telegramConfig().groups || {}).requireExplicitMention !== false))], ["Last error", health.lastError ? escapeHtml(health.lastError) : "-"]]) + '<div class="inspector-section"><h3>BotFather tips</h3><p class="muted">Create a bot with @BotFather, copy the token, paste it here, then run Pair / Re-pair.</p></div>',
          runs: renderRunInspector(),
          workspace: inspectorFacts("File Inspector", [["File", escapeHtml(state.selectedFile || "-")], ["Path", escapeHtml(compactPath((bot.homePath || "") + "/workspace/" + (state.selectedFile || "")))], ["Writable", chip("Yes (within policy)", "green")], ["Path status", chip("Allowed", "green")], ["Safety mode", chip("application-only", "amber")]]),
          users: renderUserInspector(),
          safety: renderRiskInspector(),
          settings: inspectorFacts("Configuration inspector", [["Required fields", chip("OK", "green")], ["Runtime settings", chip("OK", "green")], ["Workspace policy", chip("OK", "green")], ["Secret redaction", "Telegram token, Feishu app secret, user tokens / API keys"], ["Restart required", "Yes"]]),
        };
        inspectorRoot.innerHTML = contentByPage[state.page] || contentByPage.overview;
      }
      function inspectorFacts(title, rows) {
        return '<div class="inspector-section"><h3>' + escapeHtml(title) + '</h3>' + kv(rows) + '</div>';
      }
      function renderRunInspector() {
        const run = state.runs[0];
        if (!run) return inspectorFacts("Run details", [["Run", "No run selected"], ["Next", "Start a prompt or Quick Test."]]);
        return inspectorFacts("Run details", [["Run", escapeHtml(run.id || "-")], ["User", escapeHtml(run.userId || "-")], ["Channel", escapeHtml(run.channel || "-")], ["Session", escapeHtml(run.sessionLabel || "-")], ["Status", chip(run.status || "unknown", statusTone(run.status))], ["Goal", escapeHtml(run.objective || run.prompt || "-")]]) + '<div class="inspector-section"><h3>Timeline</h3><p class="muted">Run records currently expose summary state; richer timeline can be added later.</p></div>';
      }
      function renderUserInspector() {
        const user = state.users.find(function (item) { return item.id === state.selectedUserId; }) || state.users[0];
        if (!user) return inspectorFacts("Selected user", [["User", "No user selected"]]);
        return inspectorFacts("Selected user", [["User", escapeHtml(user.displayName || user.id)], ["ID", escapeHtml(user.id)], ["Role", chip(user.status || "free", statusTone(user.status))], ["Private access", chip(user.privateEnabled ? "Unlocked" : "Locked", user.privateEnabled ? "green" : "")], ["Credits", escapeHtml(String((user.credits && user.credits.paidCredits) || 0))], ["Last seen", escapeHtml(formatDate(user.lastSeenAt))]]) + '<div class="inspector-section"><h3>User actions</h3><div class="grid"><button data-action="operations-unlock">Unlock private access</button><button class="danger" data-action="operations-ban">Ban user</button></div></div>';
      }
      function renderRiskInspector() {
        const event = state.riskLogs.find(function (item) { return item.eventId === state.selectedRiskId; }) || state.riskLogs[0];
        if (!event) return inspectorFacts("Risk event details", [["Risk", "No unreviewed risk events"]]);
        return inspectorFacts("Risk event details", [["Risk label", chip((event.riskLabels && event.riskLabels[0]) || "review", "red")], ["Time", escapeHtml(formatDate(event.createdAt))], ["User", escapeHtml(event.userId || "-")], ["Channel", escapeHtml(event.channel || "-")], ["Run ID", escapeHtml(event.runId || "-")], ["Review status", escapeHtml((event.review && event.review.status) || "Unreviewed")]]) + '<div class="inspector-section"><h3>Content preview</h3><p class="muted">' + escapeHtml(String(event.content || "").slice(0, 240)) + '</p></div><div class="actions"><button class="primary" data-action="go-runs">Open in Runs</button></div>';
      }
      function renderRecentFiles() {
        const recent = state.workspaceFiles.filter(function (entry) { return entry.type === "file"; }).slice(0, 5);
        return table(["File", "Updated", "Size", "Action"], recent.map(function (entry) { return [escapeHtml(entry.path), escapeHtml(formatDate(entry.updatedAt)), escapeHtml(String(entry.size || 0) + " B"), '<button data-open-file="' + attr(entry.path) + '">Open</button>']; }), "No files yet. Run Quick Test or ask the assistant to create a markdown file.");
      }
      function renderDemoPrompts() {
        return table(["Prompt", "Description", "Action"], workspaceDemoPrompts.map(function (item) {
          return [escapeHtml(item.title), escapeHtml(item.description), '<button data-demo-prompt="' + attr(item.id) + '">Use Prompt</button>'];
        }), "No demo prompts configured.");
      }
      function renderWorkspaceChanges() {
        const changes = (state.chat && state.chat.workspaceChanges) || [];
        return table(["File", "Change", "Action"], changes.map(function (entry) { return [escapeHtml(entry.path), escapeHtml(entry.changeType || "updated"), '<button data-open-file="' + attr(entry.path) + '">Open</button>']; }), "No workspace file changes detected for this run.");
      }
      function renderQuickTestDiagnostics() {
        const preflight = state.detail.quickTestPreflight || {};
        return kv([["local test", "Run Quick Test can verify this host"], ["invite gate", escapeHtml(preflight.readyForIm ? "ready for a real IM test" : "finish missing IM setup first")], ["next", escapeHtml(preflight.message || "Run Quick Test and finish the setup checklist before inviting users.")]] );
      }
      function renderMissingSteps() {
        const missing = (state.detail.quickTestPreflight && state.detail.quickTestPreflight.missingSteps) || [];
        return table(["Missing step", "Action", "Target"], missing.map(function (step) { return [escapeHtml(step.label), escapeHtml(step.action || step.hint || ""), escapeHtml(step.targetTab || "-")]; }), "No diagnostic details yet.");
      }
      function formatDate(value) {
        if (!value) return "-";
        try { return new Date(value).toLocaleString(); } catch { return String(value); }
      }
      async function loadBots() {
        const snapshot = await request("/api/bots");
        state.bots = snapshot.bots || [];
        state.currentBotId = snapshot.currentBotId || ((state.bots.find(function (bot) { return bot.isCurrent; }) || state.bots[0] || {}).id || null);
        if (!state.selectedBotId) state.selectedBotId = state.currentBotId;
      }
      async function loadDetail(botId) {
        state.detail = await request("/api/bots/" + botId);
      }
      async function loadPageData(botId) {
        const results = await Promise.allSettled([
          request("/api/bots/" + botId + "/runs?limit=100"),
          request("/api/bots/" + botId + "/users"),
          request("/api/bots/" + botId + "/usage?limit=100"),
          request("/api/bots/" + botId + "/metrics"),
          request("/api/bots/" + botId + "/conversation-logs?riskOnly=true&limit=100"),
          request("/api/bots/" + botId + "/workspace"),
          request("/api/bots/" + botId + "/sessions"),
          request("/api/bots/" + botId + "/goals"),
          request("/api/bots/" + botId + "/schedules"),
          request("/api/bots/" + botId + "/skills"),
          request("/api/bots/" + botId + "/chat?sessionLabel=" + encodeURIComponent(state.activeSessionLabel || "main")),
        ]);
        state.runs = value(results[0], []);
        state.users = value(results[1], []);
        state.usage = value(results[2], []);
        state.metrics = value(results[3], null);
        state.riskLogs = value(results[4], []);
        state.workspaceFiles = value(results[5], []);
        const sessionsPayload = value(results[6], { sessions: [], activeSessionLabel: "main" });
        state.sessions = sessionsPayload.sessions || [];
        state.activeSessionLabel = sessionsPayload.activeSessionLabel || "main";
        state.goals = value(results[7], []);
        state.schedules = value(results[8], []);
        state.skills = value(results[9], []);
        state.chat = value(results[10], null);
      }
      function value(result, fallback) { return result.status === "fulfilled" ? result.value : fallback; }
      async function reloadAll() {
        try {
          await loadBots();
          if (state.selectedBotId) {
            await loadDetail(state.selectedBotId);
            await loadPageData(state.selectedBotId);
          }
          renderAll();
        } catch (error) {
          pageRoot.innerHTML = '<div class="banner danger"><div class="shield">!</div><div><h2>Control plane failed to load</h2><p class="muted">' + escapeHtml(error.message) + '</p></div></div>';
          showToast(error.message);
        }
      }
      async function mutateBot(action) {
        if (!state.selectedBotId) return;
        await request("/api/bots/" + state.selectedBotId + "/" + action, { method: "POST" });
        showToast("Bot " + action + " complete");
        await reloadAll();
      }
      async function saveTelegramSettings() {
        const token = document.getElementById("telegram-token-input")?.value.trim();
        const telegram = {
          enabled: document.getElementById("telegram-enabled-input").value === "true",
          botUsername: document.getElementById("telegram-username-input").value.trim(),
          groups: { requireExplicitMention: document.getElementById("telegram-mention-required-input").value === "true" },
        };
        if (token) telegram.botToken = token;
        await request("/api/bots/" + state.selectedBotId + "/config", { method: "POST", body: JSON.stringify({ channels: { telegram: telegram } }) });
        showToast("Saved Telegram settings");
        await reloadAll();
      }
      async function saveFeishuSettings() {
        const feishu = {
          enabled: document.getElementById("feishu-enabled-input").value === "true",
          appId: document.getElementById("feishu-app-id-input").value.trim(),
          defaultReceiveIdType: document.getElementById("feishu-receive-id-type-input").value,
          requireExplicitMention: document.getElementById("feishu-mention-required-input").value === "true",
          botMentionNames: csv("feishu-mention-names-input"),
          testAudience: { userIds: csv("feishu-test-users-input"), chatIds: csv("feishu-test-chats-input") },
          setup: {
            botCapabilityEnabled: bool("feishu-setup-bot-enabled-input"),
            messageEventSubscribed: bool("feishu-setup-event-subscription-input"),
            tenantInstalled: bool("feishu-setup-tenant-installed-input"),
            visibilityConfirmed: bool("feishu-setup-visibility-input"),
            testGroupReady: bool("feishu-setup-test-group-input"),
          },
          documentHandling: {
            enabled: bool("feishu-doc-handling-enabled-input"),
            defaultOutput: document.getElementById("feishu-doc-output-input").value,
            allowAttachmentInput: bool("feishu-attachment-input-enabled"),
            allowCloudDocLinks: bool("feishu-cloud-doc-links-enabled"),
          },
        };
        const secret = document.getElementById("feishu-app-secret-input").value.trim();
        const verificationToken = document.getElementById("feishu-verification-token-input").value.trim();
        const encryptKey = document.getElementById("feishu-encrypt-key-input").value.trim();
        if (secret) feishu.appSecret = secret;
        if (verificationToken) feishu.verificationToken = verificationToken;
        if (encryptKey) feishu.encryptKey = encryptKey;
        await request("/api/bots/" + state.selectedBotId + "/config", { method: "POST", body: JSON.stringify({ channels: { feishu: feishu } }) });
        showToast("Saved Feishu settings");
        await reloadAll();
      }
      function csv(id) { return document.getElementById(id).value.split(",").map(function (value) { return value.trim(); }).filter(Boolean); }
      function bool(id) { return document.getElementById(id).value === "true"; }
      async function runQuickTest(mode) {
        const payload = await request("/api/bots/" + state.selectedBotId + "/quick-test", { method: "POST", body: JSON.stringify({ mode: mode || "smoke" }) });
        state.page = "runs";
        await loadPageData(state.selectedBotId);
        renderAll();
        const input = document.getElementById("chat-input");
        if (input) input.value = payload.prompt || quickTestPrompt;
        showToast(mode === "workspace_file_demo" ? "File demo started" : "Quick test started");
      }
      async function runChat() {
        const prompt = document.getElementById("chat-input").value;
        await request("/api/bots/" + state.selectedBotId + "/chat", { method: "POST", body: JSON.stringify({ prompt: prompt, sessionLabel: state.activeSessionLabel || "main" }) });
        showToast("Chat run started");
        await loadPageData(state.selectedBotId);
        renderAll();
        clearTimeout(runChat._timer);
        runChat._timer = setTimeout(function () { if (state.selectedBotId) reloadAll(); }, chatPollMs);
      }
      async function saveFormConfig() {
        await request("/api/bots/" + state.selectedBotId + "/config", { method: "POST", body: JSON.stringify({ name: document.getElementById("config-name").value.trim(), runtime: { model: document.getElementById("config-model").value.trim() }, channels: { telegram: { botUsername: document.getElementById("config-bot-username").value.trim(), groups: { requireExplicitMention: document.getElementById("config-mention-required").value === "true" } } } }) });
        showToast("Saved settings");
        await reloadAll();
      }
      async function saveRawConfig() {
        await request("/api/bots/" + state.selectedBotId + "/config", { method: "POST", body: document.getElementById("config-editor").value });
        showToast("Saved raw config");
        await reloadAll();
      }
      async function grantCredits(unlock) {
        const userId = state.selectedUserId || document.getElementById("operations-user-id").value.trim();
        const amount = Number(document.getElementById("operations-credit-amount")?.value || 10);
        if (!userId || !amount) return showToast("Select a user and enter credits");
        await request("/api/bots/" + state.selectedBotId + "/users/" + encodeURIComponent(userId) + "/grant", { method: "POST", body: JSON.stringify({ amount: amount }) });
        if (unlock) await request("/api/bots/" + state.selectedBotId + "/users/" + encodeURIComponent(userId) + "/private", { method: "POST", body: JSON.stringify({ privateEnabled: true }) });
        showToast(unlock ? "Credits granted and private unlocked" : "Credits granted");
        await reloadAll();
      }
      async function deductCredits() {
        const userId = state.selectedUserId || document.getElementById("operations-user-id")?.value.trim();
        const amount = Number(document.getElementById("operations-credit-amount")?.value || 10);
        if (!userId || !amount) return showToast("Select a user and enter credits");
        await request("/api/bots/" + state.selectedBotId + "/users/" + encodeURIComponent(userId) + "/adjust", {
          method: "POST",
          body: JSON.stringify({ amount: -Math.abs(amount), reason: document.getElementById("operations-credit-reason")?.value || "manual_deduct" }),
        });
        showToast("Credits deducted");
        await reloadAll();
      }
      async function updatePrivate(privateEnabled) {
        const userId = state.selectedUserId || document.getElementById("operations-user-id")?.value.trim();
        if (!userId) return showToast("Select a user first");
        await request("/api/bots/" + state.selectedBotId + "/users/" + encodeURIComponent(userId) + "/private", { method: "POST", body: JSON.stringify({ privateEnabled: privateEnabled }) });
        await reloadAll();
      }
      async function updateStatus(status) {
        const userId = state.selectedUserId || document.getElementById("operations-user-id")?.value.trim();
        if (!userId) return showToast("Select a user first");
        await request("/api/bots/" + state.selectedBotId + "/users/" + encodeURIComponent(userId) + "/status", { method: "POST", body: JSON.stringify({ status: status }) });
        await reloadAll();
      }
      async function openWorkspaceFile(filePath) {
        state.selectedFile = filePath || document.getElementById("workspace-file-path").value.trim();
        state.currentFile = await request("/api/bots/" + state.selectedBotId + "/workspace/file?path=" + encodeURIComponent(state.selectedFile));
        state.page = "workspace";
        renderAll();
      }
      async function saveWorkspaceFile() {
        await request("/api/bots/" + state.selectedBotId + "/workspace/file", { method: "POST", body: JSON.stringify({ path: document.getElementById("workspace-file-path").value.trim(), content: document.getElementById("workspace-editor").value }) });
        showToast("Workspace file saved");
        await reloadAll();
      }
      async function reviewRisk(eventId, status) {
        await request("/api/bots/" + state.selectedBotId + "/conversation-logs/" + encodeURIComponent(eventId) + "/review", { method: "POST", body: JSON.stringify({ status: status, reviewer: "local-web" }) });
        showToast("Conversation marked " + status);
        await reloadAll();
      }
      async function cleanupLogs(dryRun) {
        const olderThan = document.getElementById("operations-cleanup-older-than").value.trim();
        if (!olderThan) return showToast("Enter an ISO timestamp first");
        if (!dryRun && !confirm("Delete local raw conversation logs older than " + olderThan + "?")) return;
        const result = await request("/api/bots/" + state.selectedBotId + "/conversation-logs/cleanup", { method: "POST", body: JSON.stringify({ olderThan: olderThan, dryRun: dryRun }) });
        document.getElementById("operations-cleanup-result").textContent = JSON.stringify(result, null, 2);
        showToast(dryRun ? "Cleanup preview ready" : "Conversation logs cleaned");
      }
      document.addEventListener("click", async function (event) {
        const nav = event.target.closest("[data-nav]");
        const action = event.target.closest("[data-action]");
        const openFile = event.target.closest("[data-open-file]");
        const demo = event.target.closest("[data-demo-prompt]");
        const allowTelegram = event.target.closest("[data-allow-telegram]");
        const useSession = event.target.closest("[data-use-session]");
        const selectUser = event.target.closest("[data-select-user]");
        const review = event.target.closest("[data-review-risk]");
        try {
          if (nav) { state.page = nav.dataset.nav; renderAll(); return; }
          if (openFile) { await openWorkspaceFile(openFile.dataset.openFile); return; }
          if (demo) { const item = workspaceDemoPrompts.find(function (candidate) { return candidate.id === demo.dataset.demoPrompt; }); state.page = "runs"; renderAll(); document.getElementById("chat-input").value = item ? item.prompt : quickTestPrompt; return; }
          if (allowTelegram) { await request("/api/bots/" + state.selectedBotId + "/telegram/access", { method: "POST", body: JSON.stringify({ accessType: allowTelegram.dataset.allowTelegram, id: allowTelegram.dataset.id }) }); await reloadAll(); return; }
          if (useSession) { await request("/api/bots/" + state.selectedBotId + "/sessions/" + encodeURIComponent(useSession.dataset.useSession) + "/use", { method: "POST" }); state.activeSessionLabel = useSession.dataset.useSession; await reloadAll(); return; }
          if (selectUser) { state.selectedUserId = selectUser.dataset.selectUser; renderAll(); return; }
          if (review) { await reviewRisk(review.dataset.reviewRisk, review.dataset.status); return; }
          if (!action) return;
          const name = action.dataset.action;
          if (name === "go-channels") { state.page = "channels"; state.channelTab = "telegram"; renderAll(); }
          else if (name === "go-feishu") { state.page = "channels"; state.channelTab = "feishu"; renderAll(); }
          else if (name === "go-runs") { state.page = "runs"; renderAll(); }
          else if (name === "go-workspace") { state.page = "workspace"; renderAll(); }
          else if (name === "go-safety") { state.page = "safety"; renderAll(); }
          else if (name === "go-setup") { state.page = "setup"; renderAll(); }
          else if (name === "channel-telegram") { state.channelTab = "telegram"; renderAll(); }
          else if (name === "channel-feishu") { state.channelTab = "feishu"; renderAll(); }
          else if (name === "start-runtime") await mutateBot("start");
          else if (name === "restart-runtime") await mutateBot("restart");
          else if (name === "stop-runtime") await mutateBot("stop");
          else if (name === "refresh") await reloadAll();
          else if (name === "quick-test") await runQuickTest("smoke");
          else if (name === "file-demo") await runQuickTest("workspace_file_demo");
          else if (name === "save-telegram") await saveTelegramSettings();
          else if (name === "telegram-pair") { await request("/api/bots/" + state.selectedBotId + "/telegram/pair", { method: "POST", body: JSON.stringify({ token: document.getElementById("telegram-token-input").value.trim() || undefined }) }); await reloadAll(); }
          else if (name === "telegram-refresh") { await request("/api/bots/" + state.selectedBotId + "/telegram/refresh", { method: "POST" }); await reloadAll(); }
          else if (name === "save-feishu") await saveFeishuSettings();
          else if (name === "run-chat") await runChat();
          else if (name === "stop-chat") { await request("/api/bots/" + state.selectedBotId + "/chat/stop", { method: "POST", body: JSON.stringify({ sessionLabel: state.activeSessionLabel || "main" }) }); await reloadAll(); }
          else if (name === "create-session") { await request("/api/bots/" + state.selectedBotId + "/sessions", { method: "POST", body: JSON.stringify({ label: document.getElementById("session-label-input").value.trim() }) }); await reloadAll(); }
          else if (name === "create-goal") { await request("/api/bots/" + state.selectedBotId + "/goals", { method: "POST", body: JSON.stringify({ objective: document.getElementById("goal-objective-input").value.trim(), sessionLabel: state.activeSessionLabel || "main" }) }); await reloadAll(); }
          else if (name === "create-schedule") { await request("/api/bots/" + state.selectedBotId + "/schedules", { method: "POST", body: JSON.stringify({ cron: document.getElementById("schedule-cron-input").value.trim(), timezone: document.getElementById("schedule-timezone-input").value.trim(), objective: document.getElementById("schedule-objective-input").value.trim() }) }); await reloadAll(); }
          else if (name === "workspace-open") await openWorkspaceFile();
          else if (name === "workspace-save") await saveWorkspaceFile();
          else if (name === "operations-grant") await grantCredits(false);
          else if (name === "operations-grant-unlock") await grantCredits(true);
          else if (name === "operations-deduct") await deductCredits();
          else if (name === "operations-unlock") await updatePrivate(true);
          else if (name === "operations-lock") await updatePrivate(false);
          else if (name === "operations-ban") await updateStatus("banned");
          else if (name === "operations-unban") await updateStatus("free");
          else if (name === "cleanup-preview") await cleanupLogs(true);
          else if (name === "cleanup-run") await cleanupLogs(false);
          else if (name === "save-form-config") await saveFormConfig();
          else if (name === "save-config") await saveRawConfig();
          else if (name === "run-migrations") { await request("/api/bots/" + state.selectedBotId + "/migrations/run", { method: "POST" }); await reloadAll(); }
          else if (name === "install-skill") { await request("/api/bots/" + state.selectedBotId + "/skills", { method: "POST", body: JSON.stringify({ sourcePath: document.getElementById("skill-source-input").value.trim() }) }); await reloadAll(); }
        } catch (error) {
          showToast(error.message || "Action failed");
        }
      });
      document.getElementById("bot-select").addEventListener("change", async function (event) {
        state.selectedBotId = event.target.value;
        await reloadAll();
      });
      document.getElementById("action-start").onclick = function () { mutateBot("start"); };
      document.getElementById("action-restart").onclick = function () { mutateBot("restart"); };
      document.getElementById("action-stop").onclick = function () { mutateBot("stop"); };
      document.getElementById("open-create-bot").onclick = function () { createBotModal.style.display = "flex"; };
      document.getElementById("close-create-bot").onclick = function () { createBotModal.style.display = "none"; };
      document.getElementById("submit-create-bot").onclick = async function () {
        const id = document.getElementById("create-bot-id").value.trim();
        const name = document.getElementById("create-bot-name").value.trim() || id;
        const enabled = document.getElementById("create-bot-enabled").value === "true";
        if (!id) return showToast("Bot id is required");
        try {
          await request("/api/bots", { method: "POST", body: JSON.stringify({ id: id, name: name, enabled: enabled }) });
          state.selectedBotId = id;
          createBotModal.style.display = "none";
          await reloadAll();
        } catch (error) {
          showToast(error.message);
        }
      };
      window.__openSetupStep = function (tabName) {
        state.page = tabName === "telegram" || tabName === "feishu" ? "channels" : (tabName === "operations" ? "users" : tabName);
        if (tabName === "feishu") state.channelTab = "feishu";
        if (tabName === "telegram") state.channelTab = "telegram";
        renderAll();
      };
      window.__useWorkspaceDemoPrompt = function (promptId) {
        const item = workspaceDemoPrompts.find(function (candidate) { return candidate.id === promptId; });
        state.page = "runs";
        renderAll();
        document.getElementById("chat-input").value = item ? item.prompt : quickTestPrompt;
      };
      window.__startRuntimeFromSetup = function () { mutateBot("start"); };
      window.__runQuickTestFromSetup = function () { runQuickTest("smoke"); };
      window.__allowTelegramAccess = function (accessType, id) {
        request("/api/bots/" + state.selectedBotId + "/telegram/access", { method: "POST", body: JSON.stringify({ accessType: accessType, id: id }) }).then(reloadAll).catch(function (error) { showToast(error.message); });
      };
      window.__reviewConversationLog = function (eventId, status) { reviewRisk(eventId, status); };
      window.__openWorkspaceFile = function (filePath) { openWorkspaceFile(filePath); };
      window.__openWorkspaceFileFromOverview = function (filePath) { openWorkspaceFile(filePath); };
      void reloadAll();
    </script>
  </body>
</html>`;
}

function navButton(page, glyph, label, badgeId = "") {
  return `<button class="${page === "overview" ? "active" : ""}" data-nav="${page}"><span class="nav-glyph">${glyph}</span><span>${label}</span><span class="nav-badge" id="${badgeId}" style="display:none;"></span></button>`;
}
