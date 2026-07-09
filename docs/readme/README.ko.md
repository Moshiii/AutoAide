# CodexBridge

CodexBridge는 Codex를 Feishu, Telegram, 로컬 operator를 위한 관리형 팀 AI 어시스턴트로 바꿉니다. 사용자별 접근 제어, credits, audit logs, persistent workspaces를 제공합니다.

언어: [中文](../../README.md) · [English](README.en.md) · [Français](README.fr.md) · [日本語](README.ja.md) · 한국어

[Getting Started](../getting-started.md) · [API Reference](../api-reference.md) · [Architecture](../current-architecture.md) · [Roadmap](../../ROADMAP.md) · [Telegram](../telegram-codex-bridge.md) · [Feishu](../feishu-channel-current-state.md)

[![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](../../package.json)
[![Version](https://img.shields.io/badge/version-0.1.0--alpha.7-blue)](../../package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](../../LICENSE)

```text
Ask Codex:
Install Moshiii/CodexBridge from GitHub and start CodexBridge.
```

## 미리보기

아래 placeholder는 실제 제품 스크린샷이 준비되면 README를 대표해야 할 네 가지 화면입니다.

<table>
  <tr>
    <td width="50%">
      <img src="../assets/screenshots/feishu-chat.svg" alt="CodexBridge Feishu team chat" />
      <br />
      <strong>Feishu 팀 채팅</strong>
    </td>
    <td width="50%">
      <img src="../assets/screenshots/web-control-plane.svg" alt="CodexBridge web control plane" />
      <br />
      <strong>Web control plane</strong>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="../assets/screenshots/user-management.svg" alt="CodexBridge user and credit management" />
      <br />
      <strong>사용자 및 credit 관리</strong>
    </td>
    <td width="50%">
      <img src="../assets/screenshots/tui-chat.svg" alt="CodexBridge local TUI chat" />
      <br />
      <strong>로컬 TUI 채팅</strong>
    </td>
  </tr>
</table>

## 왜 CodexBridge인가

Codex는 로컬 터미널에서 강력합니다. 하지만 팀에서는 shell, host machine, 관리되지 않는 account access를 넘겨주지 않고도 그 능력을 다른 사람에게 제공할 더 안전한 방법이 필요합니다.

CodexBridge는 빠져 있는 운영 레이어를 추가합니다.

- 사용자를 위한 Feishu 및 Telegram 진입점
- bot 단위 접근 제어, private unlock, bans, roles
- daily free quota, paid credits, usage ledger, admin audit log
- files, memory, sessions, logs를 위한 persistent workspaces
- runtime state, users, credits, safety, workspace files를 관리하는 web control plane
- Codex 스타일 터미널 경험을 원하는 operator를 위한 local TUI

핵심 가치는 managed access입니다. 사용자는 간단한 chat interface를 얻고, operator는 identity, quota, cost, workspace state, risk를 통제합니다.

## 사용 사례

- **Feishu 팀 AI 어시스턴트**: 선택된 팀원이나 그룹이 research, writing, summaries, file work, task planning을 요청할 수 있습니다.
- **Controlled Codex access**: terminal이나 host를 직접 노출하지 않고 Codex-backed 작업 능력을 제공합니다.
- **Shared workspace bots**: projects, clients, teams, workflows별로 별도 bot을 만듭니다.
- **Operator governance**: runs를 확인하고, credits를 관리하고, logs를 검토하고, runtimes를 중지하고, external access를 제어합니다.

## 빠른 시작

### 요구 사항

- Node.js `>=22`
- `codex` 명령으로 사용할 수 있는 Codex CLI
- 현재 `codexbridge tui` 구현에는 Rust/Cargo 필요
- 외부 chat channels를 사용할 때만 Telegram 또는 Feishu credentials 필요

### 설치

대부분의 사용자는 Codex에게 설치를 요청할 수 있습니다.

```text
Install Moshiii/CodexBridge from GitHub and start CodexBridge.
```

수동 설치:

```bash
npm install -g github:Moshiii/CodexBridge
codexbridge
```

`npm install -g codexbridge` 또는 plain `npx codexbridge`를 사용하지 마세요. npm registry의 `codexbridge` 이름은 현재 다른 package를 가리킵니다.

### 첫 실행

`codexbridge`는 active bot의 operator menu를 엽니다.

```text
CodexBridge Menu · Default (default)
Start chat with current bot
Start runtime
Switch bots
Connect Telegram or Feishu
User management
```

로컬 채팅 시작:

```bash
codexbridge tui
```

Web control plane 시작:

```bash
codexbridge web
```

## 관리할 수 있는 것

CodexBridge는 bot별 상태를 `~/.codexbridge/bots/<id>` 아래에 저장합니다.

각 bot은 자체적으로 다음을 가집니다.

- workspace 및 memory files
- Feishu 및 Telegram channel settings
- users, credits, bans, private access
- sessions, runs, logs, audit records
- runtime config 및 safety state

전체 설정은 [Getting Started](../getting-started.md)를 보세요. 명령과 local API endpoints는 [API Reference](../api-reference.md)를 보세요.

## 상태와 안전

CodexBridge는 alpha developer tool입니다.

승인된 Codex/OpenAI access는 직접 준비해야 합니다. CodexBridge는 model provider도, subscription resale layer도, account credentials를 공유하는 수단도 아닙니다. 승인된 runtime 주변의 operator-controlled gateway입니다.

로컬에서 먼저 사용하고, 신뢰할 수 있는 사용자로 먼저 테스트하세요. 외부 chat access는 민감한 기능으로 취급해야 합니다. application-level policy는 host isolation이 아닙니다. 신뢰할 수 없는 외부 사용자가 당신의 machine을 통해 Codex를 실행하기 전에 separate OS user, container, sandbox, microVM, remote worker 같은 hard isolation을 확인하세요.

## 문서

- [Getting Started](../getting-started.md) - install, first run, TUI, web control plane, Telegram, Feishu
- [API Reference](../api-reference.md) - CLI commands 및 local web API endpoints
- [Runtime Layout](../runtime-layout.md) - `~/.codexbridge` 아래 files
- [Current Architecture](../current-architecture.md) - module boundaries 및 runtime model
- [Capability Overview](../codexbridge-capability-overview.md) - current feature surface
- [Demo Workflows](../demo-workflows.md) - example tasks
- [Roadmap](../../ROADMAP.md) - product 및 engineering direction
- [Test Plan](../test-plan.md) - validation approach
- [Telegram Bridge](../telegram-codex-bridge.md) - Telegram channel details
- [Feishu Channel State](../feishu-channel-current-state.md) - Feishu/Lark current state

## 개발

```bash
npm install
npm test
npm start
```

## 지원과 보안

- Bugs 및 feature requests: GitHub issue를 열어 주세요.
- Security concerns: secrets나 private logs를 공개하지 말고 maintainer에게 private channel로 연락하세요.
- Operational safety: 신뢰할 수 없는 외부 사용자를 초대하기 전에 hard isolation을 사용하세요.

## License

MIT
