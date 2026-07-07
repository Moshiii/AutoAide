# CodexBridge Control Plane Product Spec

## Purpose

This spec defines the next web console as a full AI agent operations control plane.

The current backend already supports bots, runtime control, channels, sessions, runs, workspace files, users, credits, safety logs, migrations, and rollout. The UI should stop exposing those as flat implementation tabs and instead organize them around operator workflows.

## Product Definition

CodexBridge Control Plane is a local-first management platform for operating bot-scoped AI assistants.

It helps an operator answer:

- Which bot am I managing?
- Is it online and usable?
- Which channels can reach it?
- Is it safe enough to invite real users?
- What is the agent doing now?
- What did it change in the workspace?
- Who can use it, and what did they spend?
- What risks need review?

## Primary Users

- Solo operator testing a local AI assistant before inviting users.
- Developer/operator managing Telegram or Feishu bot access.
- Product owner reviewing runs, workspace output, credits, and safety.

## Design Principles

- Workflow first, backend second.
- Keep the selected bot visible everywhere.
- Make readiness and safety explicit.
- Prefer guided forms over raw JSON.
- Keep logs and advanced config available, but secondary.
- Use dense, calm operational UI: subtle borders, row separators, readable tables, small status chips, no decorative styling.

## Top-Level Information Architecture

Use one persistent app shell with eight primary destinations:

1. Overview
2. Setup
3. Channels
4. Runs
5. Workspace
6. Users & Access
7. Safety
8. Settings

Do not keep the old peer-level tabs:

- Telegram
- Feishu
- Sessions
- Chat
- Goals
- Schedules
- Operations
- Config

Those become pages, sections, or sub-tabs inside the new IA.

## Global App Shell

### Layout

Desktop uses four zones:

- Left navigation: product sections and current bot list entry.
- Top status bar: selected bot, runtime, channel, invite gate, primary runtime action.
- Main work area: current page workflow.
- Right inspector: contextual facts, validation, last error, and next actions.

Mobile uses:

- top bot/status bar
- drawer navigation
- main page content
- inspector as collapsible section or drawer

### Global Top Bar

Always show:

- Bot selector: current bot id/name.
- Runtime status: running, stopped, unhealthy.
- Channel status: Telegram paired/unpaired, Feishu configured/not configured.
- Invite Gate: ready/not ready.
- Primary action: Start runtime, Stop runtime, Restart.
- Emergency action only on operations-heavy pages: Stop all / Stop run.

### Global Left Navigation

Items:

- Overview
- Setup
- Channels
- Runs
- Workspace
- Users & Access
- Safety
- Settings

Rules:

- Use icons plus labels.
- Show small badges only for important counts: unreviewed risks, active runs, blockers.
- Do not overload nav with backend modules.

### Global Inspector

Inspector content changes by page, but always follows this order:

1. Current object facts
2. Health or validation
3. Last error or warning
4. Relevant quick actions
5. Links to logs or advanced details

## Shared Components

### InviteGate

Purpose: tell the operator whether this bot can be safely invited to real users.

Inputs:

- setupGuide
- health
- storageReadiness
- securityReadiness
- migrationReadiness
- channel config

States:

- Ready
- Not ready
- Needs review

Blockers:

- channel not configured
- runtime stopped
- test audience missing
- hard isolation not verified
- migrations pending

### StatusChip

Use restrained chips:

- green: healthy, paired, ready
- amber: warning, partial setup, needs action
- red: blocker, failed, banned
- gray: disabled, unknown, not configured

### DataTable

Default table for runs, users, logs, risk queue, and access lists.

Rules:

- row separators over card grids
- compact row height
- sticky table header when useful
- row action menu for secondary actions

### WizardStepper

Used in Setup and Channels.

Rules:

- one current step
- completed steps remain visible
- every incomplete step has one primary action
- backend validation drives status, not client-only state

### RightInspector

Use for object details:

- selected run
- selected file
- selected user
- selected risk event
- selected channel
- selected settings section

## Page Specs

## 1. Overview

### Job

Give the operator a command-center view of current readiness and next action.

### Main Questions

- Can I invite users?
- What is blocking me?
- Is the runtime healthy?
- Are channels connected?
- Did the agent recently fail or change files?

### Content

- Invite Gate banner
- Blockers list
- Next actions: Connect Telegram, Run Quick Test, Review Safety, Start runtime
- Runtime summary
- Channel summary
- Safety summary
- Recent runs
- Recent workspace changes

### API Mapping

- `GET /api/bots`
- `GET /api/bots/:id`
- `GET /api/bots/:id/runs`
- `GET /api/bots/:id/metrics`
- `GET /api/bots/:id/workspace`
- `GET /api/bots/:id/conversation-logs?riskOnly=true`

### MVP

- Show current bot detail and readiness.
- Show blockers and next action.
- Show recent runs and logs link.

## 2. Setup

### Job

Guide a new operator to first successful use.

### Main Flow

1. Create/select bot
2. Connect channel
3. Allow test audience
4. Start runtime
5. Send first test message

### Content

- Vertical setup stepper
- Live validation checklist
- Recommended channel path: Telegram recommended, Feishu experimental
- Quick Test panel
- Setup event log

### API Mapping

- `POST /api/bots`
- `POST /api/bots/:id/telegram/pair`
- `POST /api/bots/:id/telegram/access`
- `POST /api/bots/:id/start`
- `POST /api/bots/:id/quick-test`
- `GET /api/bots/:id`

### MVP

- Render setupGuide steps.
- Link each step to the right page/action.
- Run Quick Test from Setup.

## 3. Channels

### Job

Connect external IM channels and manage who can reach the bot.

### Structure

Use page-level sub-tabs:

- Telegram
- Feishu

### Telegram Section

Content:

- readiness strip: token, identity, audience, runtime
- setup stepper
- token and username form
- enabled toggle
- mention required setting
- Pair / Re-pair
- private access table
- group chat table
- group user table
- known chats/users tables

API:

- `POST /api/bots/:id/config`
- `POST /api/bots/:id/telegram/pair`
- `POST /api/bots/:id/telegram/access`
- `POST /api/bots/:id/telegram/refresh`
- `GET /api/bots/:id`

### Feishu Section

Content:

- experimental label
- app id / app secret
- verification token / encrypt key
- receive id type
- mention names
- setup checklist: bot capability, event subscription, tenant installed, visibility, test group
- test user ids and test chat ids
- document handling options

API:

- `POST /api/bots/:id/config`
- `GET /api/bots/:id`

### MVP

- Telegram full setup.
- Feishu settings form and checklist.
- No advanced Feishu callback debugging in MVP.

## 4. Runs

### Job

Operate active and historical AI work.

### Content

- summary row: active, queued, failed today, credits used, risk events
- runs table
- run detail inspector
- prompt preview
- output preview
- timeline events
- billing state
- permission/question state
- workspace changes
- actions: Stop, View, Refund when applicable

### Related Work Types

Runs page should unify:

- Chat turns
- Goals
- Scheduled runs
- Channel-originated runs

Goals and schedules can be secondary tabs or filters inside Runs after MVP.

### API Mapping

- `GET /api/bots/:id/chat`
- `POST /api/bots/:id/chat`
- `POST /api/bots/:id/chat/stop`
- `GET /api/bots/:id/runs`
- `GET /api/bots/:id/goals`
- `POST /api/bots/:id/goals`
- `GET /api/bots/:id/schedules`
- `POST /api/bots/:id/schedules`
- `POST /api/bots/:id/schedules/:scheduleId/enable`
- `POST /api/bots/:id/schedules/:scheduleId/disable`

### MVP

- Current web chat composer.
- Runs table.
- Stop active run.
- Recent output and workspace changes.

## 5. Workspace

### Job

Inspect and edit the bot-scoped workspace and persistent context files.

### Content

- workspace path and policy summary
- file tree
- editor/preview
- selected file inspector
- save/revert/open actions
- recent workspace changes
- warning if hard isolation is not verified

### API Mapping

- `GET /api/bots/:id/workspace`
- `GET /api/bots/:id/workspace/file?path=...`
- `POST /api/bots/:id/workspace/file`
- `GET /api/bots/:id`

### MVP

- File tree
- Read file
- Edit/save file
- Selected file metadata

## 6. Users & Access

### Job

Manage who can use the bot, paid/private access, bans, and credits.

### Content

- summary row: users, private unlocked, banned, paid credits, group quota
- users table
- filters: search, channel, role/status
- selected user inspector
- grant/deduct credits
- private unlock/lock
- ban/unban
- recent usage and runs
- access rules explanation

### API Mapping

- `GET /api/bots/:id/users`
- `POST /api/bots/:id/users/:userId/grant`
- `POST /api/bots/:id/users/:userId/adjust`
- `POST /api/bots/:id/users/:userId/status`
- `POST /api/bots/:id/users/:userId/private`
- `GET /api/bots/:id/usage`
- `GET /api/bots/:id/runs`
- `GET /api/bots/:id/metrics`

### MVP

- Users table
- Grant/deduct
- Private unlock/lock
- Ban/unban

## 7. Safety

### Job

Make trust, isolation, risk review, and audit controls explicit.

### Content

- external-user readiness banner
- isolation readiness
- workspace policy summary
- tool permission policy table
- conversation risk queue
- selected risk event inspector
- audit log links
- cleanup preview/run

### API Mapping

- `GET /api/bots/:id`
- `GET /api/bots/:id/conversation-logs`
- `GET /api/bots/:id/conversation-reviews`
- `POST /api/bots/:id/conversation-logs/:eventId/review`
- `POST /api/bots/:id/conversation-logs/cleanup`
- `GET /api/bots/:id/admin-audit`
- `POST /api/bots/:id/migrations/run`

### MVP

- Show isolation/security readiness.
- Show risk queue.
- Review risk event.
- Link to admin audit.

### Explicit Safety Copy

Do not claim hard security if isolation is not verified.

Use language like:

> Application policy is active, but hard host isolation is not verified. Use a separate OS user, container, sandbox, microVM, or remote worker before inviting untrusted users.

## 8. Settings

### Job

Let operators edit bot config safely without starting from raw JSON.

### Content

- settings subnav:
  - Bot identity
  - Runtime
  - Channel defaults
  - Workspace policy
  - Storage & migrations
  - Advanced JSON
- safe forms first
- raw JSON advanced/collapsed
- validation inspector
- restart-required indicator
- secret redaction note
- save bar

### API Mapping

- `GET /api/bots/:id`
- `POST /api/bots/:id/config`
- `POST /api/bots/:id/migrations/run`

### MVP

- Common fields form
- Runtime model/process limits
- Telegram/Feishu shared defaults
- Advanced JSON fallback

## Implementation Phases

## Phase 1: App Shell + Overview

Goal: replace flat tabs with the new control-plane shell.

Scope:

- left navigation
- top status bar
- right inspector
- Overview page
- current bot detail and readiness

Acceptance:

- user can see bot, runtime, channel, invite gate on every page
- Overview explains why the bot is or is not ready
- old horizontal tab bar is removed

## Phase 2: Setup + Channels

Goal: make first successful channel setup obvious.

Scope:

- Setup page driven by setupGuide
- Channels page
- Telegram setup and access tables
- Feishu setup form/checklist

Acceptance:

- user can configure Telegram without terminal
- user can understand Feishu requirements
- setup blockers link to the exact next action

## Phase 3: Runs + Workspace

Goal: make agent work observable and controllable.

Scope:

- Runs page
- Chat composer
- run table/detail
- Workspace file tree/editor
- workspace changes

Acceptance:

- user can start and stop a prompt from web
- user can inspect recent runs
- user can read/edit workspace files

## Phase 4: Users & Access + Safety

Goal: support real operators and external users.

Scope:

- users table
- credits and private access controls
- ban/unban
- risk queue
- review actions
- safety readiness

Acceptance:

- operator can manage access without raw files
- safety page clearly distinguishes app policy from hard isolation
- risk review workflow is usable

## Phase 5: Settings + Polish

Goal: reduce raw JSON dependency and finish advanced operations.

Scope:

- settings forms
- advanced JSON fallback
- validation
- migration controls
- responsive polish
- empty/error/loading states

Acceptance:

- common config does not require raw JSON
- save errors are clear
- mobile layout is usable

## Backend Gaps And Notes

Already available:

- most page data is already served by existing APIs
- Telegram setup is actionable
- Feishu settings are configurable
- users, credits, usage, runs, logs, reviews are available

Likely improvements:

- add first-class tool permission policy endpoint for Safety
- add first-class isolation probe trigger endpoint if web should run it
- add richer run event timeline endpoint if current run records are not enough
- add explicit workspace file metadata endpoint if file list lacks modified time and context inclusion
- add Feishu runtime diagnostics endpoint if operator debugging becomes important

## Non-Goals For MVP

- cloud multi-tenant deployment
- hosted public auth
- full billing provider integration
- automatic hard sandbox provisioning
- full Feishu app setup automation
- visual workflow builder

## Quality Bar

### UX

- every page must answer one operator job
- every empty state must explain next action
- every destructive action must confirm intent
- every async action must show progress and result
- raw JSON must never be the default path for common tasks

### Accessibility

- keyboard reachable navigation
- visible focus states
- semantic buttons and form labels
- status chips must not rely on color alone
- tables need readable headers and row actions

### Visual

- no gradients, decorative blobs, glass, or sci-fi styling
- border radius 8px or less
- avoid cards inside cards
- use dividers and spacing before borders/shadows
- table-first layouts for operational data

### Engineering

- keep backend APIs as source of truth
- do not add web-only state for runtime, users, credits, or channels
- preserve existing tests
- implement by vertical slices
- each phase should be shippable

## Recommended First Build Slice

Build Phase 1 and the minimal pieces of Phase 2:

1. New app shell
2. Overview
3. Setup stepper
4. Channels page with Telegram setup

This gives the product a coherent first impression and makes the current Get Started workflow understandable.

