# CodexBridge

CodexBridge は、Codex を Feishu、Telegram、ローカル operator 向けの管理可能なチーム AI アシスタントにします。ユーザーごとのアクセス制御、クレジット、監査ログ、永続ワークスペースを提供します。

言語：[中文](../../README.md) · [English](README.en.md) · [Français](README.fr.md) · 日本語 · [한국어](README.ko.md)

[Getting Started](../getting-started.md) · [API Reference](../api-reference.md) · [Architecture](../current-architecture.md) · [Roadmap](../../ROADMAP.md) · [Telegram](../telegram-codex-bridge.md) · [Feishu](../feishu-channel-current-state.md)

[![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](../../package.json)
[![Version](https://img.shields.io/badge/version-0.1.0--alpha.7-blue)](../../package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](../../LICENSE)

```text
Ask Codex:
Install Moshiii/CodexBridge from GitHub and start CodexBridge.
```

## プレビュー

以下は、実際のプロダクトスクリーンショットが準備できるまで README に表示する 4 つの placeholder です。

<table>
  <tr>
    <td width="50%">
      <img src="../assets/screenshots/feishu-chat.svg" alt="CodexBridge の Feishu チームチャット" />
      <br />
      <strong>Feishu チームチャット</strong>
    </td>
    <td width="50%">
      <img src="../assets/screenshots/web-control-plane.svg" alt="CodexBridge Web コントロールプレーン" />
      <br />
      <strong>Web コントロールプレーン</strong>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="../assets/screenshots/user-management.svg" alt="CodexBridge ユーザーとクレジット管理" />
      <br />
      <strong>ユーザーとクレジット管理</strong>
    </td>
    <td width="50%">
      <img src="../assets/screenshots/tui-chat.svg" alt="CodexBridge ローカル TUI チャット" />
      <br />
      <strong>ローカル TUI チャット</strong>
    </td>
  </tr>
</table>

## CodexBridge が必要な理由

Codex はローカル端末では強力です。しかしチームでは、shell、ホストマシン、管理されていないアカウントアクセスを渡さずに、その能力を他の人へ提供する安全な方法が必要です。

CodexBridge は不足している運用レイヤーを追加します。

- Feishu と Telegram から使えるユーザー入口
- bot 単位のアクセス制御、private unlock、ban、role
- 日次無料枠、paid credits、usage ledger、admin audit log
- ファイル、メモリ、セッション、ログのための永続ワークスペース
- runtime 状態、ユーザー、credits、安全性、workspace files を管理する Web control plane
- Codex 風のターミナル体験を求める operator 向けローカル TUI

価値は「管理されたアクセス」です。ユーザーはシンプルなチャット入口を使い、operator は ID、quota、cost、workspace 状態、risk を管理できます。

## ユースケース

- **Feishu のチーム AI アシスタント**：選択したメンバーやグループに、調査、文章作成、要約、ファイル作業、タスク計画を依頼できるようにします。
- **制御された Codex アクセス**：端末やホストを直接公開せずに、Codex-backed な作業能力を提供します。
- **共有 workspace bot**：プロジェクト、顧客、チーム、ワークフローごとに独立した bot を作成します。
- **Operator governance**：runs、credits、logs、runtime stop、外部アクセスを管理します。

## クイックスタート

### 要件

- Node.js `>=22`
- `codex` コマンドとして利用できる Codex CLI
- 現在の `codexbridge tui` 実装には Rust/Cargo が必要
- 外部チャネルを使う場合のみ Telegram または Feishu credentials

### インストール

多くのユーザーは Codex にインストールを依頼できます。

```text
Install Moshiii/CodexBridge from GitHub and start CodexBridge.
```

手動インストール：

```bash
npm install -g github:Moshiii/CodexBridge
codexbridge
```

`npm install -g codexbridge` や単独の `npx codexbridge` は使わないでください。npm registry の `codexbridge` 名は現在別のパッケージを指しています。

### 初回起動

`codexbridge` は active bot の operator menu を開きます。

```text
CodexBridge Menu · Default (default)
Start chat with current bot
Start runtime
Switch bots
Connect Telegram or Feishu
User management
```

ローカルチャットを起動：

```bash
codexbridge tui
```

Web control plane を起動：

```bash
codexbridge web
```

## 管理できるもの

CodexBridge は bot ごとの状態を `~/.codexbridge/bots/<id>` に保存します。

各 bot は独立した以下を持ちます。

- workspace と memory files
- Feishu と Telegram の channel settings
- users、credits、bans、private access
- sessions、runs、logs、audit records
- runtime config と safety state

詳しいセットアップは [Getting Started](../getting-started.md) を参照してください。コマンドとローカル API は [API Reference](../api-reference.md) を参照してください。

## ステータスと安全性

CodexBridge は alpha 段階の developer tool です。

承認済みの Codex/OpenAI アクセスは自分で用意してください。CodexBridge は model provider ではなく、subscription resale layer でもなく、account credentials を共有する手段でもありません。これは承認済み runtime の周囲に置く operator-controlled gateway です。

まずはローカルで使い、信頼できるユーザーでテストしてください。外部チャットアクセスは sensitive として扱ってください。アプリケーションレベルの policy は host isolation ではありません。信頼できない外部ユーザーにあなたのマシン経由で Codex を実行させる前に、別 OS ユーザー、container、sandbox、microVM、remote worker などで hard isolation を確認してください。

## ドキュメント

- [Getting Started](../getting-started.md) - install、first run、TUI、web control plane、Telegram、Feishu
- [API Reference](../api-reference.md) - CLI commands と local web API endpoints
- [Runtime Layout](../runtime-layout.md) - `~/.codexbridge` 配下の files
- [Current Architecture](../current-architecture.md) - module boundaries と runtime model
- [Capability Overview](../codexbridge-capability-overview.md) - current feature surface
- [Demo Workflows](../demo-workflows.md) - example tasks
- [Roadmap](../../ROADMAP.md) - product と engineering direction
- [Test Plan](../test-plan.md) - validation approach
- [Telegram Bridge](../telegram-codex-bridge.md) - Telegram channel details
- [Feishu Channel State](../feishu-channel-current-state.md) - Feishu/Lark current state

## 開発

```bash
npm install
npm test
npm start
```

## サポートとセキュリティ

- Bug や feature request は GitHub issue を作成してください。
- セキュリティ問題：secrets や private logs を公開せず、private channel で maintainer に連絡してください。
- 運用安全性：信頼できない外部ユーザーを招待する前に hard isolation を使ってください。

## License

MIT
