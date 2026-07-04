# CodexBridge Open Source Bridge Migration Plan

本文是把 `agent-feishu-channel` 和 `lark-coding-agent-bridge` 的工程优点迁移到 CodexBridge 的执行计划。它不是一次性重写计划，而是小切片、可验证、可回滚的模块化迁移路线。

目标不是把两个项目“照搬”进来，而是吸收它们已经验证过的边界设计：

- 从 `agent-feishu-channel` 学 Feishu 接入、卡片交互、权限询问、Codex SDK/事件流适配。
- 从 `lark-coding-agent-bridge` 学运行队列、执行器、锁、会话治理、回调安全和 workspace/run policy。
- 保留 CodexBridge 自己已有的产品资产：多 bot、本地 workspace、web control plane、用户/积分/计费、runs ledger、goals/schedules、skills、多 channel。

## 1. 总体判断

CodexBridge 当前最有价值的是产品层和本地运行层的完整性，但最薄弱的是中间运行时边界。

现在的主要问题不是“功能不够”，而是功能集中在几个大模块里：

- `plugins/feishu-codex/feishu-codex-bridge.mjs` 同时做 Feishu 事件处理、鉴权、会话路由、扣费、运行状态、Codex 调用、消息回复。
- `src/codex-runner.mjs` 直接管理 CLI 子进程、JSON 解析、状态摘要和最终输出。
- `src/run-service.mjs` 主要是运行记录状态机，还没有形成统一的 `AgentEvent` 时间线。
- `src/capability-policy.mjs` 现在更像功能开关，不能承担“别人使用我的主机跑 Codex”的硬边界。

因此迁移的主线应该是：

1. 先抽事件模型和执行器，不改现有用户体验。
2. 再抽 channel runtime，让 Feishu 和 Telegram 复用同一套执行编排。
3. 再换 Feishu Gateway 和卡片 renderer。
4. 最后加权限 broker、队列、回调安全和 workspace policy。

不要先做大规模 UI 或 CLI 重构。先把运行边界拆出来，后面所有能力都会更容易加。

## 2. 两个项目可学习清单

### 2.1 从 agent-feishu-channel 学什么

`agent-feishu-channel` 更像“飞书里的可用 agent 产品”。它的重点是用户体验、飞书消息生命周期和权限交互。

可学习点：

| 能力 | 值得学的点 | CodexBridge 落点 |
| --- | --- | --- |
| Feishu Gateway | 把飞书事件、消息发送、卡片更新、回调处理拆成清楚边界 | `src/feishu/gateway.mjs`, `src/feishu/client.mjs` |
| Message Translator | 把 Feishu 原始事件转成内部 channel envelope | 扩展 `src/channel-envelope.mjs` 或新增 `src/feishu/message-translator.mjs` |
| Card Renderer | 运行中、思考中、工具调用、最终结果、失败状态都用卡片承载 | 新增 `src/feishu/card-renderer.mjs` |
| Permission Broker | 当 agent 需要用户确认时，不靠 prompt 猜，而是通过交互式授权 | 新增 `src/permissions/permission-broker.mjs` |
| Question Broker | agent 中途需要问用户问题时，可以暂停并等待回复 | 新增 `src/runtime/question-broker.mjs` |
| Codex SDK Adapter | 用结构化 SDK 事件替代纯 CLI stdout 解析 | 新增 `src/agents/codex-sdk-adapter.mjs`，先作为实验实现 |
| 状态流 UX | 用户能看到 agent 正在做什么，而不是等最终结果 | `AgentEvent` + channel renderer |
| 文本 fallback | 卡片失败时仍然能文本回复 | `src/channels/reply-renderer.mjs` |

不建议直接照搬的点：

- 不要把 CodexBridge 的计费、用户、workspace、control plane 替换掉。
- 不要把 Feishu 做成唯一 channel。CodexBridge 已经有 Telegram/Web/CLI 的产品面，应该抽成 channel runtime。
- 不要依赖单一飞书实现作为系统中心，飞书只是一个 channel。

### 2.2 从 lark-coding-agent-bridge 学什么

`lark-coding-agent-bridge` 更像“多人协作下的 agent 执行系统”。它的重点是调度、队列、权限和可靠性。

可学习点：

| 能力 | 值得学的点 | CodexBridge 落点 |
| --- | --- | --- |
| PendingQueue | 当前 session 忙时不要直接拒绝，可以排队、取消、替换 | `src/runtime/pending-queue.mjs` |
| RunExecutor | 把一次 agent run 的生命周期集中管理 | `src/runtime/run-executor.mjs` |
| RunCoordinator | 管理同一 session/workspace 的并发策略 | `src/runtime/run-coordinator.mjs` |
| ActiveRuns | 可以查询、停止、恢复、展示运行中的任务 | `src/runtime/active-runs.mjs` |
| App/Profile Lock | 防止同一个 bot/profile 被多进程同时启动 | `src/runtime/app-locks.mjs`，复用/增强 `src/pid-files.mjs` |
| Owner/Admin/Group Access | 权限不是只有开关，要区分 owner、admin、成员、群 | `src/permissions/access-policy.mjs` |
| Workspace Policy | 每个用户/群/session 只能进指定 workspace | `src/policy/workspace-policy.mjs` |
| Run Policy | 控制是否允许写文件、执行命令、联网、使用 MCP/tool | `src/policy/run-policy.mjs` |
| Callback HMAC/Nonce | 卡片按钮和 webhook 回调必须防伪造、防重放 | `src/security/callback-auth.mjs`, `src/security/callback-nonce-store.mjs` |
| Session Catalog | 会话、用户、群、workspace、thread ref 要可查询 | 扩展 `src/session-routing.mjs` 或新增 `src/channels/session-catalog.mjs` |

不建议直接照搬的点：

- 不要把 CodexBridge 改成单 workspace、单 bot 的窄模型。
- 不要为了队列牺牲当前 runs ledger、billing ledger。
- 不要把安全只做在应用层。以后必须叠加 OS/container/sandbox。

## 3. 迁移原则

### 3.1 兼容优先

每一阶段都必须满足：

- 老 CLI 命令仍可运行。
- Telegram 当前行为不被破坏。
- Feishu 文本回复仍可用。
- Web control plane 的 runs、users、credits 不丢数据。
- 当前 `npm test` 必须持续通过。

### 3.2 旁路新增，逐步切流

不要直接改掉 `feishu-codex-bridge.mjs`。先新增模块，再让旧插件调用新模块：

```text
旧 Feishu 插件
  -> 旧逻辑
  -> 新 MessageTranslator
  -> 新 RunExecutor
  -> 新 CardRenderer
```

每次只替换一段，替换后通过 feature flag 控制：

- `CODEXBRIDGE_AGENT_EVENTS=1`
- `CODEXBRIDGE_RUN_EXECUTOR=1`
- `CODEXBRIDGE_FEISHU_GATEWAY=1`
- `CODEXBRIDGE_FEISHU_CARDS=1`
- `CODEXBRIDGE_PENDING_QUEUE=1`
- `CODEXBRIDGE_PERMISSION_BROKER=1`
- `CODEXBRIDGE_WORKSPACE_POLICY=1`

默认一开始都关。测试稳定后逐个默认打开。

### 3.3 数据向后兼容

不要一开始迁移 runs state 的存储格式。先在旧 run record 里追加字段：

```json
{
  "events": [],
  "agentProvider": "codex-cli",
  "channel": "feishu",
  "workspacePolicyId": null,
  "runPolicyId": null
}
```

老代码忽略这些字段，新代码使用这些字段。

### 3.4 模块边界先行

模块边界比具体实现更重要。先稳定接口，内部可以很薄。

例如第一版 `RunExecutor` 可以仍然调用 `startCliTurn`，但它必须输出统一的 `AgentEvent`。

## 4. 目标模块结构

建议逐步形成以下结构：

```text
src/agents/
  types.mjs
  events.mjs
  codex-cli-adapter.mjs
  codex-sdk-adapter.mjs
  adapter-registry.mjs

src/runtime/
  run-executor.mjs
  run-coordinator.mjs
  active-runs.mjs
  pending-queue.mjs
  process-pool.mjs
  app-locks.mjs
  question-broker.mjs

src/channels/
  envelope.mjs
  scope-resolver.mjs
  session-catalog.mjs
  channel-runtime.mjs
  command-router.mjs
  reply-renderer.mjs

src/feishu/
  gateway.mjs
  client.mjs
  message-translator.mjs
  card-renderer.mjs
  cards.mjs
  callback-router.mjs

src/permissions/
  access-policy.mjs
  billing-gate.mjs
  tool-permission-policy.mjs
  permission-broker.mjs
  feishu-permission-broker.mjs

src/security/
  callback-auth.mjs
  callback-nonce-store.mjs

src/policy/
  workspace-policy.mjs
  run-policy.mjs
```

迁移完成后，`plugins/feishu-codex/feishu-codex-bridge.mjs` 应该变薄，只负责启动 Feishu channel：

```js
import { createFeishuGateway } from "../../src/feishu/gateway.mjs";
import { createChannelRuntime } from "../../src/channels/channel-runtime.mjs";

const gateway = createFeishuGateway(config);
const runtime = createChannelRuntime({ channel: "feishu", gateway });

await runtime.start();
```

## 5. 核心接口设计

### 5.1 AgentEvent

统一所有 agent 输出。CLI、SDK、未来 Claude/Gemini/自研 agent 都转成这个事件。

```js
export const AgentEventType = {
  RUN_STARTED: "run.started",
  SESSION_STARTED: "session.started",
  STATUS: "status",
  THINKING_STARTED: "thinking.started",
  TOOL_STARTED: "tool.started",
  TOOL_COMPLETED: "tool.completed",
  COMMAND_STARTED: "command.started",
  COMMAND_COMPLETED: "command.completed",
  MESSAGE_DELTA: "message.delta",
  MESSAGE_COMPLETED: "message.completed",
  PERMISSION_REQUESTED: "permission.requested",
  QUESTION_REQUESTED: "question.requested",
  RUN_COMPLETED: "run.completed",
  RUN_FAILED: "run.failed",
  RUN_STOPPED: "run.stopped",
};
```

事件必须包含：

```js
{
  id,
  type,
  runId,
  sessionKey,
  createdAt,
  provider,
  payload
}
```

### 5.2 AgentAdapter

第一版只包现有 CLI。

```js
export async function runAgentTurn(request, handlers) {
  handlers.onEvent({ type: "run.started", ... });
  // call Codex CLI
  handlers.onEvent({ type: "run.completed", ... });
}
```

接口重点：

- 输入是结构化 `AgentRequest`。
- 输出是事件流。
- 不直接知道 Feishu/Telegram。
- 不直接扣费。
- 不直接写 channel 消息。

### 5.3 RunExecutor

负责一次 run 的完整生命周期：

```text
create queued run
check access
check billing
mark running
call adapter
append events
settle billing
mark completed/failed/stopped
emit channel updates
```

它应该调用现有服务，而不是替代现有服务：

- `run-service.mjs`
- `billing-service.mjs`
- `chat-request-service.mjs`
- `conversation-log.mjs`
- `codex-runner.mjs`

这样第一阶段风险最小。

### 5.4 ChannelRuntime

负责 channel 无关的编排：

```text
receive envelope
dedupe message
resolve session
route command
create run request
submit to coordinator
render events back to channel
```

Feishu/Telegram/Web 都可以共用它。

### 5.5 FeishuGateway

只处理飞书平台细节：

- 验证 webhook。
- 解析消息事件。
- 回复文本。
- 创建/更新卡片。
- 处理卡片 action。
- 处理 token/client。

它不应该知道 Codex 怎么跑，也不应该知道 billing 规则。

### 5.6 PermissionBroker

当 agent 要执行敏感动作时，不要让模型自己“承诺不会做坏事”，而是生成 permission request：

```js
{
  type: "permission.requested",
  payload: {
    action: "shell.exec",
    command: "npm install",
    cwd: "/workspace/project",
    risk: "network-and-write",
    options: ["allow-once", "deny", "allow-session"]
  }
}
```

Feishu renderer 把它渲染成卡片按钮；Telegram renderer 渲染成命令按钮或文本确认；Web renderer 渲染成 UI 弹窗。

## 6. 分阶段迁移计划

### Phase 0: 建立迁移护栏

目标：任何后续改动都有验证基线。

要做：

- 增加文档：本计划。
- 增加测试分类约定：unit、integration、fixture。
- 给当前 Feishu 插件补最小 fixture 测试：文本消息、重复消息、`/help`、busy、失败退款。
- 给 `codex-runner` 补事件解析 fixture。
- 给 `run-service` 补状态流测试。

验收：

- `npm test` 通过。
- 不启动真实 Feishu 也能测试消息转换和 command routing。
- 没有功能切流。

回滚：

- 只新增测试和文档，不影响运行。

### Phase 1: AgentEvent 事件层

目标：先建立统一事件语言，但不改变实际执行方式。

新增文件：

- `src/agents/events.mjs`
- `src/agents/types.mjs`
- `test/agents-events.test.mjs`

改造点：

- 从 `src/codex-runner.mjs` 里抽出 JSON event normalizer。
- `startCliTurn` 保持原签名。
- 新增可选 `onAgentEvent` 回调。
- 旧 `onStatus` 继续保留。

兼容策略：

```text
Codex CLI raw JSON
  -> existing summarizeEvent
  -> existing onStatus
  -> new normalizeCodexCliEvent
  -> optional onAgentEvent
```

小块验证：

- 用 fixture 输入 `thread.started`，输出 `session.started`。
- 用 fixture 输入 tool call，输出 `tool.started/tool.completed`。
- 用 fixture 输入 final agent message，输出 `message.completed`。
- 当前 Feishu/Telegram 不接 `onAgentEvent` 时行为不变。

版本建议：

- `0.1.1-alpha.1`
- feature flag: `CODEXBRIDGE_AGENT_EVENTS`

风险：

- JSON event 解析不完整。
- Codex CLI event schema 变化。

控制：

- raw event 保留在 payload。
- unknown event 不丢弃，可以转成 `status` 或 `raw`.

### Phase 2: RunExecutor 薄封装

目标：把一次运行的生命周期从 channel 插件里抽出去。

新增文件：

- `src/runtime/run-executor.mjs`
- `src/runtime/active-runs.mjs`
- `test/runtime-run-executor.test.mjs`

第一版职责：

- 创建 queued run。
- mark running。
- 调用现有 `startCliTurn`。
- mark completed/failed/stopped。
- 调用 billing settle。
- 发出 `AgentEvent`。

暂时不做：

- 队列。
- 权限 broker。
- SDK adapter。
- 卡片渲染。

兼容策略：

旧 Feishu 插件里原来这一段：

```text
prepareChatRequest
createQueuedRun
markRunRunning
startCliTurn
markRunCompleted/Failed
settle billing
reply
```

替换成：

```text
runExecutor.execute(request, handlers)
```

但 behind flag：

```text
CODEXBRIDGE_RUN_EXECUTOR=1
```

小块验证：

- mock agent 成功：run 从 queued -> running -> completed。
- mock agent 失败：run 从 queued -> running -> failed，退款逻辑被调用。
- mock stop：run -> stopped。
- 旧路径和新路径对同一个输入产生同等最终回复。

版本建议：

- `0.1.1-alpha.2`

风险：

- billing 时序错。
- run record 字段缺失。
- channel busy 判断和 active run 状态不一致。

控制：

- 旧路径保留。
- 新 executor 只调用现有 service，不直接写底层 JSON。
- golden test 对比旧路径输出。

### Phase 3: ChannelRuntime 和 ScopeResolver

目标：把 Feishu/Telegram 共同逻辑抽出来，减少 channel 插件重复。

新增文件：

- `src/channels/channel-runtime.mjs`
- `src/channels/scope-resolver.mjs`
- `src/channels/command-router.mjs`
- `src/channels/reply-renderer.mjs`
- `src/channels/session-catalog.mjs`

迁移内容：

- 从 `src/session-routing.mjs` 抽更明确的 scope/session identity。
- 从 Feishu 插件抽 command routing。
- 让 Telegram 后续也能复用同一套 runtime。

兼容策略：

- `src/session-routing.mjs` 先保留，并导出到新 resolver。
- `plugins/feishu-codex/feishu-codex-bridge.mjs` 先只迁移部分逻辑。
- `plugins/telegram-codex/telegram-codex-bridge.mjs` 先不切，等 Feishu 稳定。

小块验证：

- 私聊 envelope -> private sessionKey。
- 群聊 envelope -> group sessionKey。
- mention 消息 -> run request。
- `/help`, `/credits`, `/where`, `/stop` 不进入 executor。
- unknown command 返回 fallback。

版本建议：

- `0.1.1-alpha.3`

风险：

- sessionKey 变化导致历史会话断开。

控制：

- 新 resolver 必须兼容旧 sessionKey。
- 增加 migration/compat test。
- 对旧 sessionKey 做 snapshot 测试。

### Phase 4: Feishu Gateway 拆分

目标：把飞书平台逻辑从大插件里拆出来。

新增文件：

- `src/feishu/client.mjs`
- `src/feishu/gateway.mjs`
- `src/feishu/message-translator.mjs`
- `src/feishu/callback-router.mjs`

保留插件入口：

- `plugins/feishu-codex/feishu-codex-bridge.mjs`

插件入口只负责：

- 读取配置。
- 创建 gateway。
- 创建 channel runtime。
- 启动服务。

迁移顺序：

1. 抽 Feishu client：send text、reply message、update card。
2. 抽 message translator：event -> envelope。
3. 抽 gateway：webhook receive -> translator -> runtime。
4. 抽 callback router：card action -> permission/question/command。

兼容策略：

- 文本回复先走新 client，卡片仍然不启用。
- 旧 render message 函数保留，逐步迁入 `reply-renderer`。
- env 变量保持不变。

小块验证：

- mock Feishu text event 能转 envelope。
- mock duplicate message 能 dedupe。
- send text 参数正确。
- unsupported payload 返回原有文案。

版本建议：

- `0.1.1-alpha.4`

风险：

- Feishu SDK 参数格式和事件结构细节出错。
- 线上 webhook 验签/事件格式没覆盖。

控制：

- 保留 raw event fixture。
- translator unknown 字段透传。
- 新 gateway behind flag：`CODEXBRIDGE_FEISHU_GATEWAY=1`。

### Phase 5: Feishu Card Renderer

目标：把 agent 执行过程可视化，而不是只返回最终文本。

新增文件：

- `src/feishu/card-renderer.mjs`
- `src/feishu/cards.mjs`
- `test/feishu-card-renderer.test.mjs`

卡片状态：

- queued
- running
- thinking
- using tool
- waiting permission
- waiting user answer
- completed
- failed
- stopped

事件映射：

| AgentEvent | Feishu 表现 |
| --- | --- |
| `run.started` | 创建运行卡片 |
| `status` | 更新状态行 |
| `tool.started` | 展示工具调用 |
| `command.started` | 展示命令摘要 |
| `permission.requested` | 展示批准/拒绝按钮 |
| `question.requested` | 展示问题和回复入口 |
| `message.completed` | 展示最终答案 |
| `run.failed` | 展示失败原因 |

兼容策略：

- 默认仍然文本回复。
- `CODEXBRIDGE_FEISHU_CARDS=1` 时启用卡片。
- 卡片更新失败时 fallback 到文本。

小块验证：

- 每种 AgentEvent 都能 render 成合法卡片 JSON。
- 长文本会截断或折叠。
- update card 失败时不影响 run 完成。

版本建议：

- `0.1.1-alpha.5`

风险：

- 飞书卡片结构变更。
- 频繁更新触发限流。

控制：

- renderer 做节流：例如 800ms 或 1500ms 合并更新。
- final event 必须强制 flush。
- 卡片失败不失败整个 run。

### Phase 6: PendingQueue 和并发治理

目标：把“忙，拒绝请求”升级成“可控排队/取消/替换”。

新增文件：

- `src/runtime/pending-queue.mjs`
- `src/runtime/run-coordinator.mjs`

策略：

```text
per session: max running 1, max pending N
per workspace: max running M
per user: max pending K
global: max running G
```

默认保守：

- 每个 session 同时 1 个 running。
- 每个 session 最多 3 个 pending。
- 超过就拒绝。

用户命令：

- `/queue` 查看队列。
- `/stop` 停止当前 run。
- `/cancel <id>` 取消 pending。
- `/replace` 用新请求替换 pending。

兼容策略：

- 初期只在 Feishu 启用。
- `CODEXBRIDGE_PENDING_QUEUE=1`。
- flag 关闭时维持旧 busy 行为。

小块验证：

- 同 session 第 2 个请求进入 pending。
- 当前 run 完成后 pending 自动开始。
- `/stop` 后 pending 是否启动由策略决定。
- pending 被取消不会扣费。

版本建议：

- `0.1.2-alpha.1`

风险：

- 队列状态和 billing 状态错位。
- 用户以为任务已经在执行，实际只是 queued。

控制：

- queued run 要明确状态。
- 卡片/文本都显示排队位置。
- pending 开始执行前再做最终 billing check。

### Phase 7: PermissionBroker 和 QuestionBroker

目标：让 agent 遇到敏感操作或信息缺失时，可以显式请求用户确认。

新增文件：

- `src/permissions/permission-broker.mjs`
- `src/permissions/feishu-permission-broker.mjs`
- `src/runtime/question-broker.mjs`

第一版不要追求完全拦截所有 shell。先做结构和 UI：

- agent event 里能产生 permission request。
- Feishu 卡片能批准/拒绝。
- run executor 能等待 broker 结果。
- broker 有 timeout。

后续再接入真正 tool/shell 拦截。

兼容策略：

- 不改变现有 Codex CLI 默认权限。
- 先只用于“桥层动作”：访问文件、发送外部消息、下载附件、创建 PR、执行高风险 bridge action。
- 真正 Codex 子进程权限放到 Phase 9 的 sandbox/policy。

小块验证：

- permission request -> Feishu card。
- allow once -> run 继续。
- deny -> run 收到拒绝结果。
- timeout -> run failed/stopped。
- callback nonce 防重放。

版本建议：

- `0.1.2-alpha.2`

风险：

- 用户批准动作和实际执行动作不一致。
- callback 被伪造。

控制：

- permission payload 包含 action hash。
- callback 带 nonce、runId、actionId、expiresAt、signature。
- 批准后只允许执行同一个 actionId。

### Phase 8: Callback Security

目标：所有卡片按钮、webhook action 都有防伪造、防重放、防越权。

新增文件：

- `src/security/callback-auth.mjs`
- `src/security/callback-nonce-store.mjs`

签名内容：

```text
channel
runId
actionId
userId
createdAt
expiresAt
payloadHash
```

校验：

- signature valid。
- nonce 未使用。
- 未过期。
- user 有权限操作该 run。
- actionId 属于该 run。

兼容策略：

- 只保护新卡片 action。
- 旧文本命令不受影响。

小块验证：

- 正确签名通过。
- 修改 payload 失败。
- 重放失败。
- 过期失败。
- 非 owner/admin 操作失败。

版本建议：

- `0.1.2-alpha.3`

风险：

- 本地 nonce store 崩溃后重复使用。

控制：

- nonce store 落盘。
- nonce TTL 清理。
- actionId 和 runId 二次校验。

### Phase 9: Workspace Policy 和 Run Policy

目标：解决“别人用我的主机跑 Codex 安不安全”的核心问题。

新增文件：

- `src/policy/workspace-policy.mjs`
- `src/policy/run-policy.mjs`
- `src/permissions/tool-permission-policy.mjs`

第一版 policy：

```js
{
  workspaceRoot,
  allowReadPaths,
  allowWritePaths,
  denyPaths,
  allowNetwork,
  allowShell,
  allowGit,
  allowMcp,
  envAllowlist,
  maxRunSeconds,
  maxOutputBytes
}
```

重要判断：

- 应用层 policy 不是硬隔离。
- 真正硬隔离必须靠 OS user/container/microVM/sandbox。
- 但应用层 policy 可以先降低误操作和普通越权风险。

兼容策略：

- owner 默认沿用当前全权限。
- 普通用户默认只允许专属 workspace。
- 群聊默认更严格。

小块验证：

- 普通用户不能选择 host 任意路径作为 workspace。
- prompt 里不能把敏感 host path 注入给 agent。
- run env 只传 allowlist。
- cwd 被限制在 workspaceRoot。

版本建议：

- `0.1.2-alpha.4`

风险：

- Codex CLI 子进程仍可能通过 shell 访问宿主机。

控制：

- 明确标注这不是硬沙箱。
- 后续接 OS/container 隔离。
- 对外开放前必须至少做到独立系统用户 + workspace ACL + env allowlist。

### Phase 10: Codex SDK Adapter 实验

目标：在不破 CLI 路径的前提下，试验更结构化的 Codex SDK 接入。

新增文件：

- `src/agents/codex-sdk-adapter.mjs`
- `src/agents/adapter-registry.mjs`

适配策略：

```text
codex-cli: stable default
codex-sdk: experimental
```

配置：

```text
CODEXBRIDGE_AGENT_PROVIDER=codex-cli
CODEXBRIDGE_AGENT_PROVIDER=codex-sdk
```

小块验证：

- 同一个 prompt，CLI 和 SDK 都能产生 `AgentEvent`。
- run ledger 字段一致。
- Feishu renderer 不关心底层 provider。

版本建议：

- `0.1.3-alpha.1`

风险：

- SDK API 变化。
- SDK 权限模型和 CLI 不一致。

控制：

- CLI 永远保留为 fallback。
- provider registry 控制切换。

### Phase 11: Telegram/Web 复用新 runtime

目标：证明模块化不是只为 Feishu 服务。

迁移内容：

- Telegram 使用 `ChannelRuntime`。
- Web chat 使用 `RunExecutor`。
- reply renderer 复用 AgentEvent。

小块验证：

- Telegram 原有命令不变。
- Web console run history 仍正常。
- Feishu/Telegram/Web 的 run record 字段一致。

版本建议：

- `0.1.3-alpha.2`

风险：

- 多 channel 行为被过度统一，丢掉各自特性。

控制：

- ChannelRuntime 管编排，renderer 保持 channel-specific。

## 7. 版本节奏建议

建议按 alpha 小版本推进，不要直接发大版本。

| 版本 | 内容 | 默认开启 |
| --- | --- | --- |
| `0.1.1-alpha.1` | AgentEvent | 否 |
| `0.1.1-alpha.2` | RunExecutor | 否 |
| `0.1.1-alpha.3` | ChannelRuntime/ScopeResolver | 否 |
| `0.1.1-alpha.4` | FeishuGateway | 否 |
| `0.1.1-alpha.5` | FeishuCardRenderer | 否 |
| `0.1.2-alpha.1` | PendingQueue | 否 |
| `0.1.2-alpha.2` | PermissionBroker/QuestionBroker | 否 |
| `0.1.2-alpha.3` | CallbackSecurity | 是，仅新卡片 |
| `0.1.2-alpha.4` | WorkspacePolicy/RunPolicy | owner 宽松，普通用户严格 |
| `0.1.3-alpha.1` | CodexSDKAdapter | 否 |
| `0.1.3-alpha.2` | Telegram/Web runtime 复用 | 部分开启 |

每个 alpha 都应该满足：

- `npm test` 通过。
- 至少一组 fixture 覆盖。
- 有 feature flag。
- 有回滚路径。
- 文档更新。

## 8. 测试矩阵

### 8.1 Unit tests

必须覆盖：

- AgentEvent normalizer。
- MessageTranslator。
- ScopeResolver。
- CommandRouter。
- CardRenderer。
- CallbackAuth。
- PendingQueue。
- RunPolicy。

### 8.2 Integration tests

必须覆盖：

- Feishu text event -> run completed。
- Feishu duplicate event -> only one run。
- Feishu card action -> permission allow/deny。
- busy -> pending -> auto start。
- failed run -> billing refund。
- stopped run -> no final reply duplication。

### 8.3 Fixture tests

保留真实样例：

```text
test/fixtures/feishu/text-message.json
test/fixtures/feishu/group-mention.json
test/fixtures/feishu/card-action.json
test/fixtures/codex/thread-started.ndjson
test/fixtures/codex/tool-call.ndjson
test/fixtures/codex/final-message.ndjson
```

### 8.4 Manual smoke tests

每个 alpha 至少跑：

- CLI 本地提问。
- Feishu 私聊普通问题。
- Feishu 群里 mention。
- `/help`, `/credits`, `/where`, `/stop`。
- Web control plane 查看 run。
- 一个失败任务，确认退款/状态。

## 9. 工程风险拆解

### 9.1 最大风险：重构中断现有 Feishu

控制方式：

- 新 gateway behind flag。
- 旧插件入口保留。
- 文本路径优先于卡片路径。
- 卡片失败 fallback text。

### 9.2 最大风险：计费状态错

控制方式：

- RunExecutor 第一版只调用现有 billing service。
- pending 状态不扣费，真正开始前再检查。
- failed/stopped 状态有明确 settle 规则。
- 每个状态转换写测试。

### 9.3 最大风险：sessionKey 变化

控制方式：

- 旧 `resolveConversationIdentity` 作为兼容基线。
- 新 ScopeResolver 的 snapshot 必须和旧结果一致。
- 迁移期 session record 同时保存 oldKey/newKey。

### 9.4 最大风险：权限给用户错觉

控制方式：

- 文档明确应用层 policy 不是硬沙箱。
- 普通用户默认禁用高风险能力。
- 真正对外开放前引入 OS/container 隔离。

### 9.5 最大风险：卡片更新限流

控制方式：

- 事件合并。
- 状态去重。
- 最终结果强制 flush。
- 更新失败不影响 run。

## 10. 不应该迁移的东西

不要迁移：

- 单一 channel 假设。
- 单一 workspace 假设。
- 把 Feishu bot 当核心 runtime 的架构。
- 只服务 coding 场景的窄 session model。
- 会破坏 CodexBridge web control plane 的状态模型。
- 会替代现有 billing/users/credits 的实现。

应该保留：

- CodexBridge 的多 bot home。
- 当前 web control plane。
- users/credits/billing/usage ledger。
- workspace bootstrap/context/files。
- goals/schedules/skills。
- Telegram 作为第二 channel 的经验。

## 11. 推荐优先级

最高优先级：

1. `AgentEvent`
2. `RunExecutor`
3. `FeishuGateway`
4. `FeishuCardRenderer`
5. `PendingQueue`
6. `CallbackSecurity`
7. `PermissionBroker`
8. `WorkspacePolicy`

最低优先级：

- Codex SDK adapter。
- Telegram/Web runtime 统一。
- 高级卡片交互。
- 多 provider registry。

原因：

- 没有 `AgentEvent`，卡片、权限、队列都没有统一语言。
- 没有 `RunExecutor`，运行状态、计费、失败处理会继续散落。
- 没有 `FeishuGateway`，Feishu 插件会继续膨胀。
- 没有 `CallbackSecurity`，卡片按钮不适合做权限确认。
- 没有 `WorkspacePolicy`，不能放心让别人使用你的主机。

## 12. 第一周可执行任务

如果只做一周，建议只做这些：

### Day 1

- 新增 `src/agents/events.mjs`。
- 从 `codex-runner` 抽 normalizer。
- 增加 Codex NDJSON fixture tests。

### Day 2

- 给 `startCliTurn` 增加 `onAgentEvent`。
- 保持 `onStatus` 不变。
- 写兼容测试。

### Day 3

- 新增 `src/runtime/run-executor.mjs`。
- 用 mock adapter 测 queued/running/completed/failed。

### Day 4

- Feishu 插件 behind flag 接入 RunExecutor。
- 跑 Feishu 文本 smoke。

### Day 5

- 新增 `src/feishu/message-translator.mjs`。
- 抽文本消息、群 mention、unsupported payload fixture。

### Day 6

- 新增 `src/feishu/client.mjs`。
- 把发送文本封装起来。

### Day 7

- 整理 docs。
- 跑全量 `npm test`。
- 标记 `0.1.1-alpha.1`。

这一周结束后，用户看不到大变化，但工程上已经把最难的边界打出来了。

## 13. 最小可验证闭环

第一阶段最小闭环应该是：

```text
Feishu text message
  -> message-translator
  -> channel-runtime
  -> run-executor
  -> codex-cli-adapter
  -> AgentEvent
  -> text reply
  -> run ledger
```

这个闭环跑通后，再加卡片、权限、队列。不要反过来先做卡片 UI。

## 14. 最终架构目标

最终 CodexBridge 应该变成：

```text
Feishu / Telegram / Web / CLI
        |
Channel Gateway
        |
ChannelRuntime
        |
RunCoordinator
        |
RunExecutor
        |
AgentAdapter
        |
Codex CLI / Codex SDK / future providers
```

旁边挂：

```text
Users / Credits / Billing / Usage Ledger
WorkspacePolicy / RunPolicy / PermissionBroker
RunsState / ConversationLog / SessionCatalog
CardRenderer / TextRenderer / WebRenderer
```

这样你以后加新 channel、新 agent provider、新权限模型，都不会再去改一个巨大的 bridge 文件。

## 15. 一句话结论

CodexBridge 不应该“重写成那两个项目”，而应该把它们成熟的边界吸收进来：`agent-feishu-channel` 给 Feishu 产品体验，`lark-coding-agent-bridge` 给运行治理和安全边界，CodexBridge 自己保留产品层和多 channel/multi workspace 能力。最稳的做法是先抽 `AgentEvent + RunExecutor + FeishuGateway`，每次只切一小块，用 feature flag 控制，用 fixture 和 smoke test 验证，再逐步默认开启。

## 16. 自动化发布闸门

每次 runtime/channel/billing/session 相关改动进入 alpha 前，先执行：

```bash
npm test
npm run migration:gate
```

`npm run migration:gate` 会检查：

- 迁移核心模块和文档是否存在。
- 迁移 feature flag 在当前环境是否默认关闭。
- 回归矩阵是否覆盖 CLI、Web、Telegram、Feishu、Billing、Runs、Session、Workspace、Security。
- 回滚清单是否明确包含关闭 run executor、Feishu cards、permission broker、workspace policy 和 run ledger 检查。

这个 gate 不替代真实 IM smoke，但它把发布前必须核对的工程项固定成可执行入口，避免只靠口头 checklist。
