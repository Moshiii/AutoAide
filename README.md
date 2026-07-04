# CodexBridge

General-purpose AI assistant runtime with a persistent file workspace.

CodexBridge wraps Codex CLI as one execution and file-editing backend for a broader assistant experience: users can ask general questions, generate files, edit documents, keep context across sessions, and operate the assistant from local or chat channels.

The goal is simple:

> Give a general AI assistant a real workspace, so it can answer, create, edit, and continue work instead of only chatting.

## Why This Exists

Most AI assistants are good at conversation, but useful personal and work tasks often need more than a chat window:

- generate files and documents
- edit existing files
- keep long-lived user and project context
- preserve session history
- run through multi-step tasks
- expose progress and logs
- work from local, Telegram, or Feishu channels
- hand off work between chat and a persistent workspace

CodexBridge is an experiment in that missing layer: a local-first AI assistant runtime with a durable file workspace. Codex is currently an important entry point because it can operate on files and local tools, but the product is not limited to coding-agent use cases.

## What CodexBridge Gives You

- A runtime home at `~/.codexbridge`
- Bot-scoped workspaces under `~/.codexbridge/bots/<id>/workspace`
- General-purpose AI chat through local and external channels
- File generation and editing through the workspace
- Named sessions with resume continuity
- Workspace context files such as `AGENTS.md`, `IDENTITY.md`, `USER.md`, `SOUL.md`, and `TOOLS.md`
- Bot lifecycle commands for start, stop, restart, health, logs, and config
- Telegram bridge for remote interaction
- Experimental Feishu bridge for IM-native workflows
- Goal and schedule state for longer-running tasks
- Bot-scoped skill installation
- Local web control plane via `codexbridge web`

## Mental Model

CodexBridge is not a model provider and not just a coding agent wrapper.

It is the assistant runtime around a persistent workspace: it manages where the assistant lives, what files it can create or edit, what it remembers, which session is active, which channel invoked it, and how a human operator inspects or restarts it.

Codex CLI is currently one execution backend because it is useful for file-aware work. Over time, the durable product layer is the workspace and runtime, not any single backend.

```text
human / local shell / Telegram / Feishu / web
        |
        v
CodexBridge assistant runtime
        |
        v
workspace + files + sessions + memory + goals + skills
        |
        v
execution and editing backends
        |
        v
answers, generated files, edited documents, local actions
```

## Who It Is For

CodexBridge is useful if you want to:

- run a persistent general-purpose AI assistant instead of one-off chat sessions
- ask normal questions while also letting the assistant create and edit files
- keep assistant context in a bot-scoped workspace
- operate the assistant from Telegram or Feishu while preserving session continuity
- prototype file-centric AI workflows such as reports, notes, drafts, plans, and structured documents
- study the runtime and workspace layer around practical AI assistants

It is currently an early local-first developer tool. The CLI, bot runtime, Telegram bridge, goals, schedules, skills, and web console exist; operational hardening and product polish are still in progress.

## Quickstart

```bash
git clone https://github.com/Moshiii/CodexBridge.git
cd CodexBridge
npm install
npm link
codexbridge
```

If you do not want to link globally:

```bash
npx codexbridge
```

## Requirements

- Node.js `>=22`
- Codex CLI installed and available as `codex`
- A local shell environment

Telegram and Feishu are optional until you want external chat channels.

## First Run

On first launch, CodexBridge creates the default bot and seeds its workspace.

The default workspace lives at:

```text
~/.codexbridge/bots/default/workspace
```

CodexBridge seeds these context files:

- `AGENTS.md`
- `IDENTITY.md`
- `USER.md`
- `SOUL.md`
- `TOOLS.md`

These files are loaded into assistant turns as persistent workspace context.

## Common Workflows

### 1. Local General AI Assistant

Start the shell:

```bash
codexbridge
```

Then type normal requests:

```text
> explain this concept in simple terms
> draft a travel plan for next month
> summarize the files in this workspace
```

Useful commands inside the shell:

```text
/help
/status
/where
/sessions
/new <label>
/switch <label>
/skills
/channel
/restart
```

### 2. File Generation And Editing

Use the workspace when you want the assistant to produce real files rather than only chat replies:

```text
> create a project brief as a markdown file
> turn these notes into a structured report
> edit the draft and make it shorter
> generate a checklist I can reuse
```

Workspace files live under:

```text
~/.codexbridge/bots/<id>/workspace
```

### 3. Remote Assistant Through Telegram

Inside `codexbridge`, run:

```text
/channel
```

The pairing flow will:

- ask for your Telegram bot token
- wait for your first message to the bot
- save Telegram config under the active bot
- start the bot runtime

After pairing, you can inspect the runtime from another shell:

```bash
codexbridge bot health default
codexbridge bot logs default
```

### 4. Multiple Assistant Workspaces

CodexBridge supports multiple persistent bots.

```bash
codexbridge bots
codexbridge bot current
codexbridge bot create research --name Research
codexbridge bot use research
codexbridge bot show research
codexbridge bot start research
codexbridge bot stop research
```

Inside the interactive shell:

```text
/bots
/bot create research Research
/bot use research
/bot show
/bot show research
```

After `codexbridge bot use <id>` or `/bot use <id>`, the next `codexbridge` launch opens that bot's workspace and sessions.

### 5. Local Web Control Plane

Start the local web console:

```bash
codexbridge web
```

The web control plane currently supports bot inspection, bot lifecycle operations, session listing, local chat execution, goal and schedule views, workspace file inspection/editing, Telegram pairing, and config editing.

By default the web console binds to `127.0.0.1`. If you bind it outside localhost, set `CODEXBRIDGE_WEB_TOKEN` first; CodexBridge refuses non-localhost web binds without an operator token.

## Runtime Layout

CodexBridge uses a bot-scoped runtime layout:

```text
~/.codexbridge/
  control/
    registry.json
    active-bot.json
  logs/
  bots/
    default/
      config.json
      cli-sessions.json
      bootstrap-state.json
      schedules.json
      goals/
      skills/
      logs/
      telegram/
      feishu/
      workspace/
      memory/
```

Important paths:

- `~/.codexbridge/control/registry.json` - control-plane registry for all bots
- `~/.codexbridge/control/active-bot.json` - selected current bot
- `~/.codexbridge/bots/<id>/config.json` - canonical bot config
- `~/.codexbridge/bots/<id>/workspace` - persistent assistant workspace
- `~/.codexbridge/bots/<id>/logs` - bot runtime and bridge logs

## What `npm install` Does

`npm install` runs `postinstall` and prepares the runtime skeleton:

- `~/.codexbridge/control`
- `~/.codexbridge/bots/default`
- `~/.codexbridge/bots/default/workspace`
- `~/.codexbridge/bots/default/telegram`
- `~/.codexbridge/bots/default/logs`
- `~/.codexbridge/bots/default/goals`
- `~/.codexbridge/bots/default/skills`
- `~/.codexbridge/bots/default/memory`
- `~/.codexbridge/logs`

It does not start a background daemon.

## Channels

### Telegram

Telegram is currently the most complete external channel.

When configured, CodexBridge runs the Telegram bridge under the selected bot runtime instead of a global daemon.

### Feishu

Feishu is available as an experimental channel using the official Node SDK in long-connection mode.

Feishu setup requires:

- bot capability enabled in the Feishu app settings
- IM message permissions enabled for receive/send
- `im.message.receive_v1` added in Event Subscriptions
- the app installed or published into the target tenant

Current Feishu scope:

- receives plain text messages through `im.message.receive_v1`
- runs a normal assistant turn per chat
- sends plain text replies back to the chat
- keeps per-chat session continuity

Not yet mirrored from Telegram:

- `/goal`
- schedules
- file bridge
- rich control commands beyond `/where`

## Architecture

```text
repo/
  bin/codexbridge.mjs
  scripts/postinstall.mjs
  src/
  plugins/
  docs/

~/.codexbridge/
  control/
  logs/
  bots/
    <id>/
      config
      sessions
      goals
      schedules
      skills
      channel state
      workspace
      memory

Codex CLI
  execution and editing backend for file-aware assistant turns
```

Key files:

- [bin/codexbridge.mjs](bin/codexbridge.mjs) - CLI entrypoint
- [src/bots.mjs](src/bots.mjs) - bot lifecycle and runtime management
- [src/config.mjs](src/config.mjs) - bot-scoped paths and config I/O
- [src/cli.mjs](src/cli.mjs) - interactive shell
- [src/control-plane-web.mjs](src/control-plane-web.mjs) - local web control plane
- [src/workspace-bootstrap.mjs](src/workspace-bootstrap.mjs) - first-run bootstrap and workspace seeding
- [src/workspace-context.mjs](src/workspace-context.mjs) - workspace context loading
- [plugins/telegram-codex/telegram-codex-bridge.mjs](plugins/telegram-codex/telegram-codex-bridge.mjs) - Telegram bridge runtime
- [plugins/feishu-codex/feishu-codex-bridge.mjs](plugins/feishu-codex/feishu-codex-bridge.mjs) - Feishu bridge runtime

## Documentation

- [Current architecture](docs/current-architecture.md)
- [Capability overview](docs/codexbridge-capability-overview.md)
- [Demo workflows](docs/demo-workflows.md)
- [Roadmap](ROADMAP.md)
- [Business plan](docs/business-plan.md)
- [Test plan](docs/test-plan.md)
- [Telegram bridge](docs/telegram-codex-bridge.md)
- [Feishu channel current state](docs/feishu-channel-current-state.md)

## Development

Run tests:

```bash
npm test
```

Run the same checks used by CI:

```bash
npm run ci
```

Start the CLI from source:

```bash
npm start
```

Useful local checks:

```bash
npm run state:migrate -- status
npm run state:migrate -- run
npm run isolation:probe -- --mode container
```

Migration feature flags default to off. Use them only for local development or canary bots, then turn them back off to roll back:

- `CODEXBRIDGE_RUN_EXECUTOR`
- `CODEXBRIDGE_FEISHU_GATEWAY`
- `CODEXBRIDGE_FEISHU_CARDS`
- `CODEXBRIDGE_FEISHU_MESSAGE_FLOW`
- `CODEXBRIDGE_TELEGRAM_MESSAGE_FLOW`
- `CODEXBRIDGE_PENDING_QUEUE`
- `CODEXBRIDGE_PERMISSION_BROKER`
- `CODEXBRIDGE_WORKSPACE_POLICY`

Before letting external users run Codex through your host, verify hard isolation with `npm run isolation:probe -- --mode <system_user|container|microvm|macos_sandbox|remote_worker>` from the runtime identity. Application-level policy is not a host sandbox.

## Non-Goals

CodexBridge is not trying to be:

- a generic model API gateway
- a token resale business
- only a coding-agent wrapper
- a cloud SaaS control plane before the local-first runtime is solid

The durable layer is the AI assistant workspace: general chat, file generation, file editing, session continuity, memory, channel routing, execution visibility, skills, and operator control.
