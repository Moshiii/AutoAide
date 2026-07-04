# Migration Feature Template

Use this template before opening or merging migration work. Keep every field explicit; use `none` only when it is intentionally not applicable.

```text
Feature:
Owner:
Flag:
Touched invariants:
New modules:
Old path:
Data changes:
Unit tests:
Contract tests:
Fixture tests:
Integration tests:
Smoke tests:
Observability:
Rollback:
Default-on criteria:
```

Minimum default-on evidence:

- Feature flag has been manually enabled on a canary bot.
- Canary bot has independent `BOT_HOME` and disposable IM configuration.
- Required smoke scenarios have passing records in the smoke ledger.
- Migration flag canary evidence exists for any default-on migration flag.
- No P0/P1 bug remains open for this feature.
- Run ledger and billing records remain readable after rollback rehearsal.
- Runtime audit logs cover success, failure, rejection, and rollback-relevant events.
- Hard isolation readiness is verified before untrusted external users are invited.

Example:

```text
Feature: Feishu Card Renderer
Owner: local operator
Flag: CODEXBRIDGE_FEISHU_CARDS
Touched invariants: Feishu final reply, run status, failed output
New modules: src/feishu/card-renderer.mjs, src/feishu/card-updater.mjs
Old path: send text reply
Data changes: none
Unit tests: test/unit/feishu-card-renderer.test.mjs
Contract tests: Feishu text fallback remains available
Fixture tests: test/fixtures/feishu/card-action-allow.json
Integration tests: test/unit/feishu-callback-router.test.mjs
Smoke tests: Feishu private help, group mention, unsupported payload
Observability: runtime audit records card update fallback and callback rejection
Rollback: unset CODEXBRIDGE_FEISHU_CARDS
Default-on criteria: canary bot has 3 days without card update failures causing run failure
```
