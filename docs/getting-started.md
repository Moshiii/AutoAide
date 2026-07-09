# Getting Started

This guide takes CodexBridge from install to first local chat, then points to Telegram, Feishu, web control plane, and user management.

## Requirements

- Node.js `>=22`
- Codex CLI installed and available as `codex`
- Rust/Cargo for the current `codexbridge tui` implementation
- A local shell environment

Telegram and Feishu are optional. Feishu loads the official SDK at runtime, so install `@larksuiteoapi/node-sdk` only when you are ready to test Feishu.

## Install

Most users can ask Codex to install it:

```text
Install Moshiii/CodexBridge from GitHub and start CodexBridge.
```

Manual install from GitHub:

```bash
npm install -g github:Moshiii/CodexBridge
codexbridge
```

Or run it inside a local test project:

```bash
mkdir codexbridge-test
cd codexbridge-test
npm init -y
npm install github:Moshiii/CodexBridge
npx codexbridge bot current
```

Do not use `npm install -g codexbridge` or plain `npx codexbridge`; the npm registry name currently points to a different package.

## First Run

On first launch, CodexBridge creates the default bot and seeds its workspace:

```text
~/.codexbridge/bots/default/workspace
```

The workspace starts with persistent context files:

- `AGENTS.md`
- `IDENTITY.md`
- `USER.md`
- `SOUL.md`
- `TOOLS.md`

These files are loaded into assistant turns as durable workspace context.

Bot labels in the CLI and web control plane are shown as `name (id)`, for example `Default (default)`. The id is the stable runtime/config key; the name is the human-facing label.

## Local Chat

Open the operator menu:

```bash
codexbridge
```

Choose `Start chat with current bot`, or launch the TUI directly:

```bash
codexbridge tui
```

Then ask normal requests:

```text
> explain this concept in simple terms
> draft a travel plan for next month
> summarize the files in this workspace
```

Workspace files live under:

```text
~/.codexbridge/bots/<id>/workspace
```

## Web Control Plane

Start the local web console:

```bash
codexbridge web
```

The web control plane supports bot inspection, lifecycle operations, local chat execution, user and credit operations, goal and schedule views, workspace file inspection/editing, Telegram pairing, Feishu configuration, and config editing.

By default the web console binds to `127.0.0.1`. If you bind it outside localhost, set `CODEXBRIDGE_WEB_TOKEN`; CodexBridge refuses non-localhost web binds without an operator token.

## Multiple Bots

CodexBridge supports multiple persistent bots:

```bash
codexbridge bots
codexbridge bot current
codexbridge bot create research --name Research
codexbridge bot use research
codexbridge bot show research
codexbridge bot start research
codexbridge bot stop research
```

Inside the operator menu, use `Switch bots` or `new bot`. The interactive `new bot` flow asks for a bot name and generates a 4-digit bot id automatically.

## User Management

Users are bot-scoped. A user created under one bot does not automatically appear under another bot.

Inside `codexbridge`, choose `User management`, select a user for the current bot, then choose an action:

```text
Add credits
Adjust credits
Adjust dailyFreeLimit
Unlock private
Lock private
Ban user
Unban user
View usage
View audit log
```

The same operations are available through `codexbridge users ...`; see [API Reference](api-reference.md).

## Telegram

Inside `codexbridge`, choose `Connect Telegram or Feishu`, then Telegram.

The setup flow asks for your Telegram bot token, waits for your first message to the bot, saves Telegram config under the active bot, and starts the bot runtime.

After pairing:

```bash
codexbridge bot health default
codexbridge bot logs default
```

## Feishu / Lark

Install the Feishu SDK only when you need Feishu:

```bash
npm install @larksuiteoapi/node-sdk
```

For a global CodexBridge install:

```bash
npm install -g @larksuiteoapi/node-sdk
```

Feishu setup requires:

- bot capability enabled in the Feishu app settings
- IM message permissions enabled for receive/send
- `im.message.receive_v1` added in Event Subscriptions
- the app installed or published into the target tenant

Current Feishu scope:

- receives text messages through `im.message.receive_v1`
- runs assistant turns per chat
- sends replies with text fallback for richer interactions
- keeps per-chat session continuity
- supports typing/progress feedback and card-based runtime interactions where enabled
- uses the same bot-scoped user access and credit accounting layer

## Safety Note

Before letting external users run Codex through your host, verify hard isolation with a separate OS user, container, sandbox, microVM, or remote worker. Application-level policy is not a host sandbox.
