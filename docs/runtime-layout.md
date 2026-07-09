# Runtime Layout

CodexBridge stores local runtime state under `~/.codexbridge`.

## Directory Structure

```text
~/.codexbridge/
  control/
    registry.json
    active-bot.json
  logs/
  bots/
    <id>/
      config.json
      cli-sessions.json
      bootstrap-state.json
      users.json
      user-credits.json
      usage-ledger.jsonl
      admin-audit.jsonl
      schedules.json
      goals/
      skills/
      logs/
      telegram/
      feishu/
      workspace/
      memory/
```

## Important Files

| Path | Purpose |
|---|---|
| `~/.codexbridge/control/registry.json` | Registry for all bots. |
| `~/.codexbridge/control/active-bot.json` | Current active bot. |
| `~/.codexbridge/bots/<id>/config.json` | Canonical bot config. |
| `~/.codexbridge/bots/<id>/cli-sessions.json` | CLI/TUI session references. |
| `~/.codexbridge/bots/<id>/bootstrap-state.json` | First-run personalization state. |
| `~/.codexbridge/bots/<id>/users.json` | Bot-scoped user access state. |
| `~/.codexbridge/bots/<id>/user-credits.json` | Paid credits and daily free quota state. |
| `~/.codexbridge/bots/<id>/usage-ledger.jsonl` | Credit grants, charges, refunds, and adjustments. |
| `~/.codexbridge/bots/<id>/admin-audit.jsonl` | Local operator actions such as grants, locks, bans, and review decisions. |
| `~/.codexbridge/bots/<id>/workspace/` | Persistent assistant workspace. |
| `~/.codexbridge/bots/<id>/logs/` | Runtime and bridge logs. |
| `~/.codexbridge/bots/<id>/telegram/` | Telegram bridge state. |
| `~/.codexbridge/bots/<id>/feishu/` | Feishu bridge state. |
| `~/.codexbridge/bots/<id>/goals/` | Goal state. |
| `~/.codexbridge/bots/<id>/skills/` | Bot-scoped installed skills. |

## What `npm install` Prepares

`npm install` runs `postinstall` and prepares the runtime skeleton:

- `~/.codexbridge/control`
- `~/.codexbridge/bots/default`
- `~/.codexbridge/bots/default/workspace`
- `~/.codexbridge/bots/default/telegram`
- `~/.codexbridge/bots/default/logs`
- `~/.codexbridge/bots/default/goals`
- `~/.codexbridge/bots/default/skills`
- `~/.codexbridge/bots/default/memory`
- `~/.codexbridge/bots/default/users.json`
- `~/.codexbridge/bots/default/user-credits.json`
- `~/.codexbridge/logs`

It does not start a background daemon.

## Workspace Context Files

New bots seed a workspace with:

- `AGENTS.md`
- `IDENTITY.md`
- `USER.md`
- `SOUL.md`
- `TOOLS.md`

These files are loaded into assistant turns as persistent workspace context.

## Safety Boundary

The workspace policy limits application-level reads and writes, but it is not a host sandbox. Before allowing untrusted external users, run the isolation probe and use hard isolation such as a separate OS user, container, sandbox, microVM, or remote worker.
