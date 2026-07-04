# CodexBridge Demo Workflows

CodexBridge should be explained through file-centric assistant workflows, not as a coding-only tool.

The product promise is:

> Ask anything, then let the assistant create, edit, and keep working inside a persistent file workspace.

These workflows are designed for README demos, short videos, product walkthroughs, and hiring conversations.

## Workflow 1: Ask, Create, And Save A Useful File

### User Need

A user wants more than a chat answer. They want a reusable file they can keep, edit, and send.

Example tasks:

- travel plan
- meeting brief
- product idea one-pager
- weekly plan
- comparison table
- personal decision memo

### Demo Prompt

```text
Create a 3-day Beijing weekend plan for two people as a markdown file.
Make it relaxed, include food, walks, cafes, and one backup indoor option per day.
Save it as beijing-weekend-plan.md in the workspace.
```

### Expected Assistant Behavior

1. Understand the request as a general AI task, not a coding task.
2. Create a real file under the active bot workspace.
3. Use readable markdown with sections, bullets, and backup options.
4. Report the saved filename and summarize what was created.

### Expected Artifact

```text
~/.codexbridge/bots/default/workspace/beijing-weekend-plan.md
```

### What This Proves

- CodexBridge is not just chat.
- The assistant has a persistent workspace.
- The output becomes a real user-owned file.
- Codex is being used as a file-aware backend, not as the product boundary.

## Workflow 2: Edit An Existing Draft

### User Need

A user has rough notes or a messy draft and wants the assistant to turn it into a usable document.

Example tasks:

- rewrite a resume summary
- clean up a proposal
- turn meeting notes into a report
- shorten a long message
- convert scattered thoughts into a structured plan

### Demo Setup

Create a file:

```text
~/.codexbridge/bots/default/workspace/raw-notes.md
```

Example content:

```markdown
# Random Notes

I want to explain this product but it is messy.
It is an AI assistant. It can answer questions.
But also files are important. It should generate documents.
Codex is just one backend because it can edit files.
Need make this into a clear product description.
```

### Demo Prompt

```text
Read raw-notes.md and rewrite it into a clear product one-pager.
Save the result as product-one-pager.md.
Keep it concise and suitable for a GitHub README or investor intro.
```

### Expected Assistant Behavior

1. Read the existing file from the workspace.
2. Preserve the user's intent.
3. Rewrite it into a coherent one-pager.
4. Save a new file instead of only replying in chat.

### Expected Artifact

```text
~/.codexbridge/bots/default/workspace/product-one-pager.md
```

### What This Proves

- The assistant can work with existing user files.
- The workflow supports editing and transformation, not only generation.
- The persistent workspace makes follow-up turns natural.

Follow-up prompt:

```text
Make product-one-pager.md more concrete for non-technical users.
Add three example use cases.
```

## Workflow 3: Continue A Long-Running Personal Project

### User Need

A user wants the assistant to remember the state of an ongoing project and continue across sessions or channels.

Example projects:

- career planning
- product planning
- writing a long article
- preparing a launch checklist
- maintaining a personal knowledge workspace

### Demo Prompt

```text
Create a launch checklist for CodexBridge as a general AI assistant with a file workspace.
Save it as launch-checklist.md.
Include product, demo, docs, distribution, and risk sections.
```

Then later, from another session or channel:

```text
Open launch-checklist.md.
Mark the README positioning work as done.
Add the next three tasks for a public demo.
```

### Expected Assistant Behavior

1. Create a durable planning file.
2. Reopen and update it later.
3. Preserve project continuity through the workspace.
4. Make progress inspectable through files, not only transient chat.

### Expected Artifact

```text
~/.codexbridge/bots/default/workspace/launch-checklist.md
```

### What This Proves

- CodexBridge supports continuity.
- The assistant can return to existing project state.
- The workspace becomes the user's durable operating surface.

## Demo Script

For a short 60-90 second demo:

1. Start `codexbridge`.
2. Ask it to create `beijing-weekend-plan.md`.
3. Show the file in the workspace.
4. Ask it to edit the file with a new constraint.
5. Show the updated file.
6. Open `codexbridge web` and show that workspace files and sessions are inspectable.
7. End with the positioning line:

```text
CodexBridge is a general AI assistant runtime with a persistent file workspace.
```

## Success Criteria

A viewer should understand within one minute:

- This is a general AI assistant, not only a coding agent.
- The assistant can create and edit files.
- The files live in a persistent workspace.
- Sessions and context can continue.
- Codex is a backend for file-aware execution, not the whole product.

## What Not To Demo First

Avoid leading with:

- low-level bot runtime internals
- config JSON
- token accounting
- multi-agent terminology
- framework claims
- broad platform promises

Those may matter later, but the first demo should make the user value obvious:

> I can ask an AI for help, and it can produce and revise real files in a workspace that persists.
