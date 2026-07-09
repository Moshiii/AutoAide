# API Reference

This reference covers the local CLI and the local web control plane API.

CodexBridge is currently local-first. The web API is intended for the bundled control plane and local operator tooling, not as a hosted public API.

## CLI

```text
codexbridge
codexbridge web [status|stop|restart] [--host <host>] [--port <port>]
codexbridge tui
codexbridge tui-turn <bot-id>
codexbridge bot <create|show|use|current|run|start|stop|restart|enable|disable|delete|logs|config|set-config|health> ...
codexbridge bots
codexbridge users <list|show|grant|adjust|unlock|lock|ban|unban|status|usage|runs|audit> ... [--bot <id>]
codexbridge skills [list|install <zip-or-path>]
```

Set `CODEXBRIDGE_DEBUG=1` to print stack traces for unexpected errors.

## Bot Commands

| Command | Purpose |
|---|---|
| `codexbridge bots` | List all bots as JSON. |
| `codexbridge bot current` | Show the active bot. |
| `codexbridge bot create <id> --name <name>` | Create a bot. |
| `codexbridge bot use <id>` | Set the active bot. |
| `codexbridge bot show <id>` | Inspect a bot. |
| `codexbridge bot start <id>` | Start the bot runtime. |
| `codexbridge bot stop <id>` | Stop the bot runtime. |
| `codexbridge bot restart <id>` | Restart the bot runtime. |
| `codexbridge bot health <id>` | Show runtime health. |
| `codexbridge bot logs <id>` | Show bot logs. |
| `codexbridge bot config <id>` | Print bot config. |
| `codexbridge bot set-config <id> --json '<json>'` | Merge a JSON config patch. |

## User Commands

Users are scoped to a bot. Without `--bot <id>`, commands operate on the active bot.

| Command | Purpose |
|---|---|
| `codexbridge users list [--bot <id>]` | List users with credit summaries. |
| `codexbridge users show <user-id> [--bot <id>]` | Show one user. |
| `codexbridge users grant <user-id> <amount> [--bot <id>]` | Add paid credits. |
| `codexbridge users adjust <user-id> <amount> [--reason <reason>] [--bot <id>]` | Increase or decrease paid credits. |
| `codexbridge users unlock <user-id> [--bot <id>]` | Enable private chat access. |
| `codexbridge users lock <user-id> [--bot <id>]` | Disable private chat access. |
| `codexbridge users ban <user-id> [--bot <id>]` | Ban a user. |
| `codexbridge users unban <user-id> [--bot <id>]` | Return a user to free status. |
| `codexbridge users status <user-id> <free|paid|admin|banned> [--bot <id>]` | Set user status. |
| `codexbridge users usage [user-id] [--limit <n>] [--bot <id>]` | Show usage ledger events. |
| `codexbridge users runs [user-id] [--limit <n>] [--bot <id>]` | Show run records. |
| `codexbridge users audit [user-id] [--limit <n>] [--bot <id>]` | Show admin audit events. |

There is no delete command; use ban or lock instead.

## Web Runtime Commands

| Command | Purpose |
|---|---|
| `codexbridge web` | Start or reuse the local control plane runtime. |
| `codexbridge web status` | Show web runtime status. |
| `codexbridge web stop` | Stop the web runtime. |
| `codexbridge web restart [--host <host>] [--port <port>]` | Restart the web runtime. |

Non-localhost hosts require `CODEXBRIDGE_WEB_TOKEN`.

## Skills Commands

| Command | Purpose |
|---|---|
| `codexbridge skills list` | List installed skills. |
| `codexbridge skills install <zip-or-path>` | Install a skill package into the selected bot. |

## Local Web API

Start the API with:

```bash
codexbridge web
```

Default origin:

```text
http://127.0.0.1:8787
```

If binding outside localhost, requests must include the configured operator token.

### Global

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/current-bot` | Get the active bot. |
| `GET` | `/api/bots` | List bots. |
| `POST` | `/api/bots` | Create a bot. |

### Bot Lifecycle

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/bots/:botId` | Get bot control plane detail. |
| `DELETE` | `/api/bots/:botId` | Delete a bot. |
| `POST` | `/api/bots/:botId/use` | Set active bot. |
| `POST` | `/api/bots/:botId/enable` | Enable bot. |
| `POST` | `/api/bots/:botId/disable` | Disable bot. |
| `POST` | `/api/bots/:botId/start` | Start runtime. |
| `POST` | `/api/bots/:botId/stop` | Stop runtime. |
| `POST` | `/api/bots/:botId/restart` | Restart runtime. |
| `GET` | `/api/bots/:botId/logs` | Read bot logs. |
| `GET` | `/api/bots/:botId/bridge-logs` | Read bridge logs. |
| `GET` | `/api/bots/:botId/config` | Read config. |
| `POST` | `/api/bots/:botId/config` | Patch config. |

### Chat And Sessions

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/bots/:botId/sessions` | List sessions. |
| `POST` | `/api/bots/:botId/sessions` | Create a session. |
| `POST` | `/api/bots/:botId/sessions/:label/use` | Activate a session. |
| `GET` | `/api/bots/:botId/chat` | Read chat status. |
| `POST` | `/api/bots/:botId/chat` | Start a chat turn. |
| `POST` | `/api/bots/:botId/chat/stop` | Stop a chat turn. |
| `POST` | `/api/bots/:botId/quick-test` | Run a quick local test. |

### Channels

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/bots/:botId/telegram/pair` | Pair Telegram. |
| `POST` | `/api/bots/:botId/telegram/access` | Allow Telegram user/group access. |
| `POST` | `/api/bots/:botId/telegram/refresh` | Refresh Telegram metadata. |

### Users, Credits, And Audit

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/bots/:botId/users` | List users. |
| `POST` | `/api/bots/:botId/users/:userId/grant` | Add paid credits. |
| `POST` | `/api/bots/:botId/users/:userId/adjust` | Adjust paid credits. |
| `POST` | `/api/bots/:botId/users/:userId/status` | Set status. |
| `POST` | `/api/bots/:botId/users/:userId/private` | Lock or unlock private access. |
| `GET` | `/api/bots/:botId/usage` | List usage events. |
| `GET` | `/api/bots/:botId/runs` | List runs. |
| `GET` | `/api/bots/:botId/admin-audit` | List admin audit events. |
| `GET` | `/api/bots/:botId/metrics` | Get bot metrics. |

### Workspace, Skills, Goals, And Safety

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/bots/:botId/workspace` | List workspace files. |
| `GET` | `/api/bots/:botId/workspace/file?path=<path>` | Read a workspace file. |
| `POST` | `/api/bots/:botId/workspace/file` | Write a workspace file. |
| `GET` | `/api/bots/:botId/skills` | List skills. |
| `POST` | `/api/bots/:botId/skills` | Install a skill. |
| `GET` | `/api/bots/:botId/goals` | List goals. |
| `POST` | `/api/bots/:botId/goals` | Create a goal. |
| `GET` | `/api/bots/:botId/schedules` | List schedules. |
| `POST` | `/api/bots/:botId/schedules` | Create a schedule. |
| `POST` | `/api/bots/:botId/schedules/:scheduleId/enable` | Enable a schedule. |
| `POST` | `/api/bots/:botId/schedules/:scheduleId/disable` | Disable a schedule. |
| `GET` | `/api/bots/:botId/conversation-logs` | List redacted conversation logs. |
| `POST` | `/api/bots/:botId/conversation-logs/:eventId/review` | Review a risk event. |
| `POST` | `/api/bots/:botId/conversation-logs/cleanup` | Cleanup conversation logs. |
| `GET` | `/api/bots/:botId/conversation-reviews` | List review events. |
| `POST` | `/api/bots/:botId/migrations/run` | Run state migrations. |

### Rollout

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/rollout/restart-all` | Restart all bots. |
| `POST` | `/api/rollout/canary` | Restart selected bots for canary rollout. |
| `POST` | `/api/rollout/rollback/:botId` | Roll back one bot. |
