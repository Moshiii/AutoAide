# CodexBridge 代码级借鉴与取舍报告

对比源码：

- CodexBridge: `/Users/moshiwei/Documents/GitHub/01_AI_Agents_LLM/AutoAide`
- agent-feishu-channel: `/Users/moshiwei/Documents/GitHub/01_AI_Agents_LLM/agent-feishu-channel`
- lark-coding-agent-bridge: `/Users/moshiwei/Documents/GitHub/01_AI_Agents_LLM/lark-coding-agent-bridge`

目标：

- 明确 CodexBridge 应该从两个开源项目学习哪些代码结构。
- 明确 CodexBridge 当前哪些模块应该保留、重构、废弃。
- 给出可执行的模块迁移路线，而不是泛泛说“增强安全”。

## 一、总判断

CodexBridge 当前最大问题不是“功能少”，而是 **边界不够硬、核心运行链路不够深、channel 插件承载了太多职责**。

你现在已经有很多产品层能力：

- 多 bot runtime。
- bot-scoped workspace。
- Web control plane。
- Telegram bridge。
- Feishu bridge。
- users/credits/billing。
- runs ledger。
- goals/schedules。
- skills。

这些能力两个开源项目大多没有，应该保留。

但两个开源项目在以下代码结构上明显更成熟：

- Feishu gateway。
- message translator。
- session state machine。
- run coordinator。
- provider adapter。
- permission broker。
- Feishu card renderer。
- callback security。
- workspace/run policy。

所以 CodexBridge 的正确方向不是推倒重写，而是：

1. 保留产品层。
2. 把 Telegram/Feishu 插件里的通用运行逻辑抽出来。
3. 用两个开源项目的结构重建 Feishu-native agent runtime。
4. 最后把同一套 runtime 反哺 Telegram 和 Web。

## 二、代码级 Keep / Refactor / Replace 清单

### Keep：应该保留并继续加强

| CodexBridge 模块 | 当前文件 | 判断 | 原因 |
|---|---|---|---|
| 多 bot registry | `src/bots.mjs`、`src/config.mjs` | 保留 | 这是 CodexBridge 区别于两个开源项目的产品核心 |
| bot-scoped workspace | `src/workspace-bootstrap.mjs`、`src/workspace-context.mjs`、`src/workspace-files.mjs` | 保留 | 长期助手 workspace 是差异化 |
| Web control plane | `src/control-plane-*.mjs`、`src/web-runtime.mjs` | 保留 | 两个开源项目没有完整运营控制台 |
| users/credits/billing | `src/users-state.mjs`、`src/user-credits.mjs`、`src/billing-service.mjs`、`src/usage-ledger.mjs` | 保留 | 商业化和公开入口必需 |
| runs ledger | `src/run-service.mjs`、`src/runs-state.mjs` | 保留但扩展 | 已有状态记录，但需要接 AgentEvent |
| goals/schedules | `src/goal-*.mjs`、`src/schedules-state.mjs` | 保留 | 长任务方向有差异化 |
| channel envelope 概念 | `src/channel-envelope.mjs` | 保留但扩展 | 多渠道统一入口是正确方向 |
| pid/process 基础工具 | `src/pid-files.mjs` | 保留但补锁 | 当前能用，但还不是 app/profile 级硬锁 |

### Refactor：应该重构，不要继续堆逻辑

| CodexBridge 模块 | 当前文件 | 问题 | 重构方向 |
|---|---|---|---|
| Feishu bridge | `plugins/feishu-codex/feishu-codex-bridge.mjs` | transport、access、billing、session、run、render 混在一个文件 | 拆成 gateway/translator/runtime/renderer |
| Telegram bridge | `plugins/telegram-codex/telegram-codex-bridge.mjs` | 功能成熟但文件过大，和 Feishu 重复很多逻辑 | 抽 shared `ChannelRuntime` |
| Codex runner | `src/codex-runner.mjs` | 只输出 final output 和少量 status，缺少事件流 | 包装成 `CodexCliAdapter`，输出统一 `AgentEvent` |
| Session routing | `src/session-routing.mjs` | 只有 channel/user/chat，没有 topic/comment/provider/workspace | 扩展成 `ScopeResolver` 和 `SessionIdentity` |
| Capability policy | `src/capability-policy.mjs` | 只覆盖 goal/schedule/stop 等产品权限 | 扩展为 user/group/admin/run/workspace/tool 权限模型 |
| Workspace prompt | `src/workspace-context.mjs` | 直接拼文本，缺少结构化桥接上下文 | 改成 prompt sections + workspace context |

### Replace / Drop：建议放弃当前实现方式

| 当前做法 | 建议 | 理由 |
|---|---|---|
| Feishu 只用纯 text reply | 替换为 card renderer + text fallback | Feishu 是卡片平台，纯文本体验差太多 |
| Feishu active run 时直接 busy 拒绝 | 替换为 pending queue + interrupt | IM 用户经常连续补充消息，直接拒绝不自然 |
| Feishu 只支持 text message | 替换为 message translator | post/image/file/quote 是 Feishu 实际工作流 |
| callback 未来如果只靠 `value.cmd` | 不要做，直接上 HMAC token | 按钮 value 不可信，必须防伪造/重放 |
| 用 prompt 约束“只能访问 workspace” | 不要当安全边界 | 必须靠 OS/container/sandbox/workspace policy |
| Codex 子进程继承完整 `process.env` | 改为 env allowlist | 现在会把宿主环境暴露给 agent |
| `danger-full-access` 类默认能力 | 外部用户禁用 | 公开入口不能默认全权限 |

## 三、从 agent-feishu-channel 应该学什么

这个项目最值得学的是 **Feishu-native interaction loop** 和 **provider SDK/broker 结构**。

### 1. 学 `FeishuGateway`

参考文件：

- `agent-feishu-channel/src/feishu/gateway.ts`

它的结构：

```text
WSClient
  -> EventDispatcher
    -> im.message.receive_v1
      -> dedup
      -> access check
      -> translateReceiveEvent
      -> onMessage
    -> card.action.trigger
      -> access check
      -> onCardAction
```

CodexBridge 当前：

- `plugins/feishu-codex/feishu-codex-bridge.mjs` 里直接注册事件并处理所有业务。

建议新建：

```text
src/feishu/gateway.mjs
src/feishu/client.mjs
src/feishu/message-translator.mjs
src/feishu/card-action-router.mjs
```

CodexBridge 应保留：

- users/credits/billing。
- botHome/config。

但 gateway 不应该知道 billing。gateway 只输出标准 `ChannelEnvelope`。

### 2. 学 `FeishuClient`

参考文件：

- `agent-feishu-channel/src/feishu/client.ts`

CodexBridge 现在 Feishu 只有局部 `sendText()`。

建议封装：

```text
replyText(parentMessageId, text)
sendText(chatId, text)
replyCard(parentMessageId, card)
sendCard(chatId, card)
patchCard(messageId, card)
convertMessageIdToCardId(messageId)
streamElementContent(cardId, elementId, content, sequence)
downloadImage(messageId, imageKey)
```

这样 renderer 和业务都不直接碰 Lark SDK。

### 3. 学 card streaming 状态分层

参考文件：

- `agent-feishu-channel/src/index.ts`
- `agent-feishu-channel/src/feishu/cards.ts`
- `agent-feishu-channel/src/feishu/final-reply.ts`

它把一次 turn 拆成：

- status card：即时光标。
- thinking card：可选显示思考。
- tool activity card：工具审计。
- intermediate replies card：中间文本折叠。
- final answer card：最终答案。

CodexBridge 应先实现简化版：

```text
StatusCardRenderer
ToolActivityRenderer
FinalAnswerRenderer
TextFallbackRenderer
```

最小闭环：

1. 用户发消息。
2. 立即 reply status card：`Queued` / `Running`。
3. Codex event 更新 status。
4. 完成后发 final answer card。
5. 卡片失败时回退 text。

### 4. 学 `PermissionBroker`

参考文件：

- `agent-feishu-channel/src/claude/permission-broker.ts`
- `agent-feishu-channel/src/claude/feishu-permission-broker.ts`

它的接口思路很好：

```text
request(toolCall) -> Promise<PermissionResponse>
resolveByCard(requestId, senderOpenId, choice)
cancelAll(reason)
```

CodexBridge 当前没有 tool approval。你现在的 access control 是“这个人能不能用”，不是“这个 tool 能不能跑”。

建议新建：

```text
src/permissions/permission-broker.mjs
src/permissions/feishu-permission-broker.mjs
src/permissions/policy.mjs
```

初始策略：

- public/free user：不允许 shell 或只允许 read-only。
- trusted user：workspace-write，但 shell/network 需要审批。
- owner：admin/full，可配置是否仍审批危险操作。

### 5. 学 `QuestionBroker` 和 ask_user MCP

参考文件：

- `agent-feishu-channel/src/claude/feishu-question-broker.ts`
- `agent-feishu-channel/src/claude/ask-user-mcp.ts`

这对 CodexBridge 很有价值，因为你的产品不只是 coding agent，而是长期助手。

可以迁移成：

```text
src/questions/question-broker.mjs
src/questions/feishu-question-broker.mjs
```

用途：

- agent 需要用户确认需求。
- goal runner 遇到 blocked。
- 选择项目/工作区。
- 确认危险操作。

### 6. 学 Codex SDK adapter

参考文件：

- `agent-feishu-channel/src/codex/sdk-run.ts`

CodexBridge 当前 `codex-runner.mjs` 走 shell JSONL。短期可以保留，但主线应该转 SDK adapter。

目标模块：

```text
src/agents/types.mjs
src/agents/codex-cli-adapter.mjs
src/agents/codex-sdk-adapter.mjs
src/agents/agent-events.mjs
```

统一事件：

```js
{
  type: "tool_use",
  id,
  name,
  input
}
{
  type: "tool_result",
  id,
  output,
  isError
}
{
  type: "text",
  delta
}
{
  type: "done",
  threadId,
  usage
}
```

## 四、从 lark-coding-agent-bridge 应该学什么

这个项目最值得学的是 **产品化边界、安全边界和 run 编排**。

### 1. 学 `PendingQueue`

参考文件：

- `lark-coding-agent-bridge/src/bot/pending-queue.ts`

它解决的问题：

- 用户连续发三条消息，应该合并，不应该开三次 agent。
- agent 正在跑时，普通消息应排到下一轮。
- 命令仍然立即执行。

CodexBridge 当前 Feishu：

- active run 时直接 busy 拒绝。

建议新建：

```text
src/runtime/pending-queue.mjs
```

行为：

- per scope debounce 600ms。
- active run 时 block。
- run 结束后 unblock 并重新计时。
- `/stop`、`/new`、`/cd` 这类命令绕过 queue。

### 2. 学 `RunExecutor`

参考文件：

- `lark-coding-agent-bridge/src/runtime/run-executor.ts`

CodexBridge 现在 run 分散在：

- `src/web-chat-service.mjs`
- `plugins/telegram-codex/telegram-codex-bridge.mjs`
- `plugins/feishu-codex/feishu-codex-bridge.mjs`
- `src/goal-runner.mjs`

这会导致：

- stop 行为不一致。
- run 状态记录不一致。
- billing/ledger 接入不一致。
- future permission broker 难接。

建议新建：

```text
src/runtime/run-executor.mjs
src/runtime/run-coordinator.mjs
src/runtime/active-runs.mjs
src/runtime/process-pool.mjs
```

所有 channel 都通过它跑 agent。

### 3. 学 app/profile runtime lock

参考文件：

- `lark-coding-agent-bridge/src/runtime/locks.ts`
- `lark-coding-agent-bridge/src/runtime/registry.ts`

CodexBridge 当前有 pid file，但没有 app-level lock。

问题：

- 两个 bot 如果配置同一个 Feishu appId，飞书事件可能被多个 WebSocket 分摊，出现随机漏消息。
- stale pid 和真实 app conflict 不是一回事。

建议：

```text
src/runtime/app-locks.mjs
```

锁 key：

```text
channel:feishu:appId:<app_id>
channel:telegram:botTokenHash:<hash>
```

### 4. 学 access model

参考文件：

- `lark-coding-agent-bridge/src/policy/access.ts`
- `lark-coding-agent-bridge/src/policy/owner.ts`

CodexBridge 当前 access 更偏 SaaS 计费：

- free/paid/admin/banned。
- privateEnabled。
- daily free。

这很好，但不等于团队安全。

需要叠加：

```text
ownerUserId
adminUserIds
allowedPrivateUserIds
allowedGroupIds
requireMentionInGroup
unknownGroupBehavior
```

建议不要删除 credits，而是分两层：

```text
AccessLayer:
  这个用户/群是否允许进入 bot

BillingLayer:
  这次调用是否有额度
```

现在 `prepareChatRequest()` 把 access/billing/policy/run 创建都放一起，建议拆开。

### 5. 学 workspace policy

参考文件：

- `lark-coding-agent-bridge/src/policy/workspace.ts`
- `lark-coding-agent-bridge/src/policy/run-policy.ts`

CodexBridge 现在有 workspace 文件读写的路径校验，但 Codex 子进程安全边界不够硬。

建议：

```text
src/policy/workspace-policy.mjs
src/policy/run-policy.mjs
```

必须检查：

- cwd 必须 realpath。
- cwd 不得是 `/`。
- cwd 不得是 home root。
- cwd 不得是系统目录。
- cwd 不得是 tmp root。
- public user cwd 必须是 bot/user 专属 workspace。
- 外部用户不能继承 owner 的真实 HOME、SSH、tokens。

### 6. 学 callback HMAC

参考文件：

- `lark-coding-agent-bridge/src/card/callback-auth.ts`
- `lark-coding-agent-bridge/src/card/callback-store.ts`

CodexBridge 未来做 Feishu buttons 时，必须直接上这个级别。

目标模块：

```text
src/security/callback-auth.mjs
src/security/callback-nonce-store.mjs
```

Token payload 至少包含：

```text
runId
scope
chatId
operatorUserId
action
expiresAt
policyFingerprint
nonce
keyVersion
```

不要只做：

```json
{ "cmd": "allow" }
```

那样不安全。

### 7. 学 session catalog

参考文件：

- `lark-coding-agent-bridge/src/session/catalog.ts`
- `lark-coding-agent-bridge/src/session/store.ts`

CodexBridge 当前 session routing 是：

- direct: `channel:user:userId`
- group: `channel:chat:chatId:user:userId`

这个有产品意义，但不够支持 provider/workspace/permission。

建议 session identity：

```text
scopeId
channel
chatId
threadId?
userId?
mode: per_user | shared_chat | topic
provider
workspaceRealpath
permissionFingerprint
model
```

这样 resume 不会错接。

## 五、CodexBridge 应该放弃哪些现有设计

### 1. 放弃“Feishu 插件继续单文件增长”

当前：

- `plugins/feishu-codex/feishu-codex-bridge.mjs`

问题：

- 已经混合了 SDK、pid、state、metadata、mention、billing、run、reply。
- 继续加 card/permission/file/topic 会失控。

替代：

```text
plugins/feishu-codex/feishu-codex-bridge.mjs 只保留 main()
src/feishu/gateway.mjs
src/feishu/client.mjs
src/feishu/translator.mjs
src/channels/runtime.mjs
src/channels/commands.mjs
src/renderers/feishu-card-renderer.mjs
```

### 2. 放弃“busy 拒绝新消息”

当前：

- active run -> `renderBusyMessage()`
- run denied reason `running_session`

问题：

- 用户体验差。
- 运行中补充上下文无法进入下一轮。
- 和 IM 使用习惯冲突。

替代：

- pending queue。
- queued notice。
- run end flush。
- `!` interrupt。

### 3. 放弃“Codex final output 才是 run 结果”的模型

当前：

- `codex-runner.mjs` 主要提取 final text。
- run service 存 completed/failed。

问题：

- 无法展示过程。
- 无法审计工具。
- 无法精确计费/诊断。
- 无法做权限审批。

替代：

- AgentEvent timeline。
- run started/status/tool/text/done/error。
- Web 和 Feishu 都消费同一份 timeline。

### 4. 放弃“prompt 是安全边界”

当前风险：

- workspace prompt 会告诉 agent 用 workspace，但 Codex 子进程仍继承宿主权限。
- 外部用户如果能让 Codex 跑 shell，可能读宿主用户能读的东西。

替代：

- OS/container boundary。
- env allowlist。
- workspace mount。
- read-only/workspace-write/full 分级。
- permission broker。

### 5. 放弃“Feishu 只做 Telegram 的移植”

Feishu 不是 Telegram。

Telegram 强在：

- 简单文本。
- 文件收发。
- 长轮询。

Feishu 强在：

- 卡片。
- 表单。
- button callback。
- 群/话题。
- 文档评论。
- 企业身份。

所以 Feishu bridge 应该是 Feishu-native，而不是 Telegram text bot 复刻。

## 六、CodexBridge 应该保留哪些自己的设计

### 1. 保留 bot-scoped workspace

这是差异化。不要因为两个项目偏 coding workspace，就放弃你的 assistant workspace。

但要增加：

- user-scoped workspace for untrusted users。
- project-scoped workspace for trusted teams。
- workspace policy。

### 2. 保留 Web control plane

这是两个开源项目没有的强项。

下一步应该把 Feishu run card 连接到 Web run detail：

- Feishu card 展示简洁进度。
- Web 展示完整 tool timeline、logs、workspace changes、billing。

### 3. 保留 credits/runs/admin

这是公开使用和商业化必要能力。

但要拆清：

```text
Access decision != Billing decision != Tool permission decision
```

不要都塞在 `prepareChatRequest()`。

### 4. 保留 goals/schedules

这让 CodexBridge 超出“聊天机器人”。

但 goal runner 要接新 runtime：

- 每轮 goal executor/supervisor 都应该通过 RunExecutor。
- goal progress 写 run event。
- Feishu/Web 都能看。

### 5. 保留 multi-channel envelope

这是对的。

但 envelope 要升级。

当前：

```js
{
  channel,
  chatType,
  chatId,
  userId,
  messageId,
  text,
  raw
}
```

建议：

```js
{
  channel,
  chatType,
  chatId,
  threadId,
  userId,
  senderType,
  messageId,
  text,
  mentions,
  attachments,
  quote,
  explicitlyMentionedBot,
  raw
}
```

## 七、建议的新模块结构

建议新增而不是在旧文件里继续堆：

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

src/channels/
  envelope.mjs
  scope-resolver.mjs
  channel-runtime.mjs
  command-router.mjs
  command-dispatcher.mjs

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

现有文件对应迁移：

| 旧文件 | 去向 |
|---|---|
| `src/codex-runner.mjs` | 包装成 `src/agents/codex-cli-adapter.mjs`，未来加 SDK adapter |
| `src/channel-envelope.mjs` | 升级/迁入 `src/channels/envelope.mjs` |
| `src/session-routing.mjs` | 升级/迁入 `src/channels/scope-resolver.mjs` |
| `src/chat-request-service.mjs` | 拆成 access/billing/run intake 三部分 |
| `plugins/feishu-codex/feishu-codex-bridge.mjs` | 缩成启动入口 |
| `plugins/telegram-codex/telegram-codex-bridge.mjs` | 逐步复用 `ChannelRuntime` |
| `src/run-service.mjs` | 保留 ledger，但不负责执行 |
| `src/web-chat-service.mjs` | 改为调用 `RunCoordinator` |
| `src/goal-runner.mjs` | 改为调用 `RunExecutor` |

## 八、迁移顺序

### Step 1：抽 AgentEvent，不改用户体验

目标：

- 不动 Feishu/Telegram UI。
- 先让 `codex-runner` 能输出事件。

产出：

- `src/agents/events.mjs`
- `src/agents/codex-cli-adapter.mjs`
- 单元测试覆盖 JSONL。

验收：

- 现有 200 个测试仍通过。
- Web/Telegram/Feishu 仍能得到 final output。
- 新增测试能看到 tool/status/done 事件。

### Step 2：抽 RunExecutor

目标：

- 统一 Web、Telegram、Feishu、Goal 的运行入口。

产出：

- `src/runtime/run-executor.mjs`
- `src/runtime/active-runs.mjs`

验收：

- stop 行为一致。
- run ledger 能记录 started/completed/failed。
- web chat 和 Feishu 仍可运行。

### Step 3：重建 Feishu Gateway

目标：

- 把 Feishu transport 从业务里剥离。

产出：

- `src/feishu/gateway.mjs`
- `src/feishu/client.mjs`
- `src/feishu/message-translator.mjs`

验收：

- text 消息功能不退化。
- post/image 至少能翻译或明确 unsupported。
- dedup/access 在 gateway 层可测。

### Step 4：加 Feishu card renderer

目标：

- Feishu 不再只是纯文本。

产出：

- status card。
- final answer card。
- text fallback。

验收：

- Codex 运行期间能更新 status。
- 卡片失败仍回复 text。

### Step 5：加 pending queue

目标：

- 运行中消息不再 busy 拒绝。

产出：

- `src/runtime/pending-queue.mjs`
- channel runtime 接入。

验收：

- 连续消息合并。
- run active 时新消息进入下一轮。
- `/stop` 仍立即生效。

### Step 6：加 permission broker 和 callback auth

目标：

- 外部用户不能任意驱动危险工具。

产出：

- Permission card。
- HMAC callback token。
- nonce store。

验收：

- 非 owner 不能代点别人的审批。
- 旧按钮不能重放。
- 超时自动 deny。

### Step 7：加 sandbox/workspace policy

目标：

- 从 prompt 安全升级到硬边界。

产出：

- workspace realpath policy。
- env allowlist。
- permission mode mapping。
- 可选独立 worker user/container。

验收：

- 外部用户默认不能访问 owner HOME。
- workspace 外路径被拒绝。

## 九、最重要的代码级原则

### 1. Transport 不碰业务

FeishuGateway 只做：

- 收事件。
- 验证/去重。
- 翻译。
- 发给 ChannelRuntime。

不要在 gateway 里做：

- billing。
- Codex run。
- workspace。
- goal。

### 2. ChannelRuntime 不碰 Feishu SDK

ChannelRuntime 只处理：

- envelope。
- scope。
- command。
- queue。
- run。
- access/billing。

它通过 Renderer 输出，不直接调用 Lark SDK。

### 3. Renderer 不决定权限

Renderer 只负责展示：

- text。
- card。
- status。
- tool。

权限由 AccessPolicy / PermissionBroker 决定。

### 4. AgentAdapter 不知道 channel

AgentAdapter 只输入：

- prompt。
- cwd。
- session/thread id。
- permission mode。
- attachments。

只输出 AgentEvent。

### 5. Security 不靠 prompt

Prompt 可以提醒 agent，但不能作为边界。

硬边界顺序：

1. OS/container user。
2. filesystem mount/permission。
3. env allowlist。
4. network policy。
5. workspace policy。
6. tool approval。
7. audit log。

## 十、最终取舍建议

### 应该学的

从 `agent-feishu-channel` 学：

- FeishuGateway。
- FeishuClient。
- card streaming。
- PermissionBroker。
- QuestionBroker。
- Codex SDK adapter。

从 `lark-coding-agent-bridge` 学：

- PendingQueue。
- RunExecutor。
- app/profile lock。
- owner/admin/group access。
- workspace policy。
- callback HMAC。
- session catalog。

### 应该保留的

CodexBridge 自己的：

- bot-scoped runtime。
- workspace identity/memory。
- Web control plane。
- users/credits/billing。
- runs ledger。
- goals/schedules。
- multi-channel ambition。

### 应该放弃的

- Feishu 单文件继续堆。
- Feishu 纯 text bot 思路。
- active run 直接 busy 拒绝。
- final output-only run 模型。
- prompt-only 安全边界。
- Codex 子进程继承完整宿主环境。
- 把 access、billing、run creation、policy 都塞在一个函数里。

如果只做一件事：

> 先抽 `AgentEvent + RunExecutor + FeishuGateway`。

这三个抽出来后，后面的卡片、权限、队列、Web run timeline、goal progress 都能自然接上。继续在现有 Feishu 插件里补功能，只会越补越难维护。
