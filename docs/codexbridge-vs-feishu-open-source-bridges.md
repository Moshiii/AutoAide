# CodexBridge 与两个 Feishu/Lark 开源 Agent Bridge 横向对比报告

对比对象：

- **CodexBridge / AutoAide**：当前仓库 `/Users/moshiwei/Documents/GitHub/01_AI_Agents_LLM/AutoAide`
- **agent-feishu-channel**：`/Users/moshiwei/Documents/GitHub/01_AI_Agents_LLM/agent-feishu-channel`
- **lark-coding-agent-bridge**：`/Users/moshiwei/Documents/GitHub/01_AI_Agents_LLM/lark-coding-agent-bridge`

结论先讲清楚：

CodexBridge 不是“比它们差一个等级的同类产品”。它和这两个项目的产品重心不一样。

- 你的 CodexBridge 更像 **local-first assistant runtime**：多 bot、workspace、Telegram、Feishu、Web 控制台、用户/积分/计费、runs ledger、goals/schedules、skills、workspace memory。
- 这两个开源项目更像 **专业 Feishu/Lark coding-agent bridge**：把 Feishu 群聊/私聊/卡片交互非常深入地接到 Claude/Codex。

所以差距要分开看：

- **整体产品层**：CodexBridge 的范围更大，已有很多它们没有的产品模块。
- **Feishu 原生体验层**：CodexBridge 明显落后，尤其是卡片、权限审批、会话调度、附件、provider SDK、callback 安全、群聊/话题细节。
- **工程成熟度**：CodexBridge 已有测试和模块化，但关键插件仍偏“AI 快速堆出来的可运行实现”；两个开源项目在边界、状态机和故障处理上更像长期维护项目。

## 一、三者产品定位

| 项目 | 核心定位 | 适合用户 | 当前强项 |
|---|---|---|---|
| CodexBridge | 持久 workspace + 多入口 AI assistant runtime | 想要一个长期存在、能写文件、能多渠道访问的个人/团队助手 | 多 bot、workspace memory、Telegram、Web 控制台、goals/schedules、credits/runs/admin |
| agent-feishu-channel | Claude/Codex 原生接入 Feishu 群聊 | 想在飞书里直接跑 coding agent 的开发者/团队 | Feishu WebSocket、卡片流式、权限审批、ask_user、Claude/Codex SDK |
| lark-coding-agent-bridge | 产品化 Lark/Feishu coding-agent bridge | 想安装一个较完整 Feishu coding-agent bot 的用户 | profile、daemon、访问控制、工作区安全、文档评论、callback 安全、session catalog |

CodexBridge 的野心更大，但 Feishu 这条 channel 目前更浅。两个竞品则把 Feishu 这一个场景打得很深。

## 二、总体成熟度评分

评分是源码阅读后的工程判断，不是绝对价值判断。

| 维度 | CodexBridge | agent-feishu-channel | lark-coding-agent-bridge |
|---|---:|---:|---:|
| 产品范围 | 8/10 | 5/10 | 7/10 |
| Feishu 原生体验 | 3/10 | 8/10 | 9/10 |
| 多渠道能力 | 7/10 | 2/10 | 3/10 |
| Workspace / 文件 runtime | 8/10 | 5/10 | 7/10 |
| Session 编排 | 5/10 | 8/10 | 9/10 |
| Run 队列与并发控制 | 4/10 | 7/10 | 9/10 |
| Agent provider 抽象 | 4/10 | 8/10 | 8/10 |
| 权限审批 | 3/10 | 9/10 | 8/10 |
| 访问控制 | 6/10 | 4/10 | 9/10 |
| Callback 安全 | 2/10 | 5/10 | 9/10 |
| 附件/媒体 | 5/10 Telegram，1/10 Feishu | 6/10 | 7/10 |
| Web/运营控制台 | 8/10 | 0/10 | 2/10 |
| 测试覆盖 | 6/10 | 8/10 | 9/10 |
| 常驻进程运维 | 6/10 | 3/10 | 9/10 |

一句话：

- CodexBridge 是 **产品面宽、Feishu 面浅**。
- agent-feishu-channel 是 **Feishu agent 核心闭环强、产品面窄**。
- lark-coding-agent-bridge 是 **Feishu bridge 产品化程度最高**。

## 三、CodexBridge 当前架构拆解

### 1. CLI 和多 bot runtime

核心文件：

- `bin/codexbridge.mjs`
- `src/bots.mjs`
- `src/config.mjs`
- `src/pid-files.mjs`
- `src/channel-adapters.mjs`

已有能力：

- `codexbridge` interactive CLI。
- `codexbridge bot create/use/start/stop/restart/logs/config/health`。
- 多 bot registry：
  - `~/.codexbridge/control/registry.json`
  - `~/.codexbridge/control/active-bot.json`
  - `~/.codexbridge/bots/<id>/...`
- Bot runtime pid file。
- Channel bridge pid file。
- Bot orphan cleanup。
- rolling restart、canary、rollback 这些部署/运营概念。

和两个开源项目对比：

- 比 `agent-feishu-channel` 强很多。后者基本只有 `afc init` 和 `afc`。
- 和 `lark-coding-agent-bridge` 类似都做了多实例/常驻进程，但命名和边界不同：
  - CodexBridge 是 bot-centric。
  - lark-coding-agent-bridge 是 profile-centric。

差距：

- CodexBridge 当前 pid file 是可用的，但没有 `proper-lockfile` 那样的 profile/app lock 机制。
- 同一个 Feishu app 被多个 bot/进程同时连接时，缺少强约束。
- daemon 目前更像“自己 spawn runtime”，不是系统级 launchd/systemd/schtasks 服务。

可借鉴：

- 从 `lark-coding-agent-bridge` 借鉴 app-level runtime lock。
- 给每个 channel appId 做单实例锁，而不仅是 bot pid。
- 后续如果产品化，增加 OS daemon install/status/unregister。

### 2. Workspace 和长期记忆

核心文件：

- `src/workspace-bootstrap.mjs`
- `src/workspace-context.mjs`
- `src/workspace-files.mjs`
- `docs/reference/templates/*`

已有能力：

- Bot-scoped workspace。
- 自动 seed：
  - `AGENTS.md`
  - `IDENTITY.md`
  - `SOUL.md`
  - `USER.md`
  - `TOOLS.md`
  - `HEARTBEAT.md`
  - `BOOTSTRAP.md`
- `buildWorkspacePrompt()` 会把私有上下文文件注入 prompt。
- Web 控制台能查看/编辑 workspace 文件。

和两个开源项目对比：

- 这是 CodexBridge 的强项。
- `agent-feishu-channel` 有 `/memory`，能读写 `CLAUDE.md` / `AGENTS.md`，但没有这么完整的 assistant identity/workspace bootstrap。
- `lark-coding-agent-bridge` 有 workspaces 和 lark-cli 环境注入，但更偏 coding agent working directory，不是人格化/长期助手 workspace。

差距：

- CodexBridge 的 workspace prompt 目前是直接拼文本，缺少结构化 `<bridge_context>`、`<user_input>`、`<attachments>` 这类协议块。
- 对不同 channel 的上下文没有统一 schema。
- 没有 per-run policy fingerprint，resume 时无法判断当前 workspace/权限/模型是否仍兼容。

可借鉴：

- 借鉴 `lark-coding-agent-bridge` 的 prompt section 格式：
  - `<bridge_context>`
  - `<quoted_messages>`
  - `<interactive_cards>`
  - `<user_input>`
- 保留你自己的 workspace memory，但把 channel metadata 结构化注入。

### 3. Codex 执行层

核心文件：

- `src/codex-runner.mjs`
- `src/web-chat-service.mjs`
- `plugins/telegram-codex/telegram-codex-bridge.mjs`
- `plugins/feishu-codex/feishu-codex-bridge.mjs`

已有能力：

- 通过 shell 执行：
  - `codex exec --skip-git-repo-check --json -`
  - `codex exec resume --skip-git-repo-check --json __SESSION_ID__ -`
- 解析 JSONL：
  - `thread.started`
  - `item.completed` agent_message
- 提取 final text 和 thread id。
- 支持 onStatus：
  - Session started
  - Running command
  - Finished command
  - Thinking
- 支持 stop child。

和两个开源项目对比：

- `agent-feishu-channel` 使用 `@openai/codex-sdk`，provider 接入更现代、更结构化。
- `lark-coding-agent-bridge` 虽然也支持 CLI/JSONL，但有完整 AgentAdapter、AgentEvent、RunExecutor、Codex JSONL translator。
- CodexBridge 当前是函数式 runner，没有 provider adapter 层。

差距：

- 没有统一 `AgentEvent` 抽象。
- tool_use/tool_result/usage/error 没有完整建模。
- 没有 approval/sandbox 与 permission broker 对接。
- stdout JSONL 解析偏最小化，对协议漂移和异常事件处理少。
- 对 Codex SDK 的能力没有利用。

可借鉴：

- 短期：引入统一事件类型，先包住现有 CLI。
- 中期：参考 `agent-feishu-channel/src/codex/sdk-run.ts` 做 Codex SDK adapter。
- 长期：把 CLI runner 降级成 fallback provider。

### 4. Channel abstraction

核心文件：

- `src/channel-adapters.mjs`
- `src/channel-envelope.mjs`
- `plugins/telegram-codex/telegram-codex-bridge.mjs`
- `plugins/feishu-codex/feishu-codex-bridge.mjs`

已有能力：

- Channel adapter registry：
  - Telegram
  - Feishu
- Channel envelope：
  - channel
  - chatType
  - chatId
  - userId
  - messageId
  - isDirect / isGroup
  - explicitlyMentionedBot
  - text
  - raw
- Telegram 和 Feishu 都归一到 envelope。

和两个开源项目对比：

- 两个开源项目基本只做 Feishu/Lark，不做多渠道抽象。
- CodexBridge 的 channel abstraction 是优势。

差距：

- envelope 太薄：
  - 没有 threadId/topicId。
  - 没有 mentions 列表。
  - 没有 senderType。
  - 没有 attachments。
  - 没有 reply/quote。
  - 没有 card action。
- 对 Feishu 的 `chat_type`、`mentions`、`post`、`image`、`interactive` 没有完整建模。

可借鉴：

- 参考 `lark-coding-agent-bridge` 的 `BridgePromptContext`，扩展 envelope。
- 参考 `agent-feishu-channel` 的 message-translator，把 Feishu event -> IncomingMessage 独立出来。

### 5. Telegram bridge

核心文件：

- `plugins/telegram-codex/telegram-codex-bridge.mjs`

已有能力：

- Telegram long polling。
- 私聊/群聊 mention 检测。
- allowed chat/user 配置。
- document upload/download。
- sessions：
  - main session
  - per chat/user session
  - `/sessions`
  - `/where`
  - `/status`
- `/stop`。
- goals/schedules 相关命令。
- file commands。
- credits。
- runtime restart。

和两个开源项目对比：

- Telegram 不是它们的重点。CodexBridge 在 Telegram 上的产品能力比自己 Feishu 上成熟得多。
- 你的 Feishu 插件明显是借了 Telegram 插件的一部分思路，但没有完整迁移。

差距：

- Telegram 插件文件很大，职责混在一个文件中。
- 很多函数是 channel-specific，但业务逻辑和通用逻辑混杂。
- Feishu 没有达到 Telegram 的功能深度。

可借鉴：

- 把 Telegram/Feishu 的共性抽成 `ChannelRuntime`：
  - session
  - command routing
  - billing
  - run execution
  - stop
  - run ledger
  - conversation log
- 每个 channel 只做 transport 和 rendering。

### 6. Feishu bridge

核心文件：

- `plugins/feishu-codex/feishu-codex-bridge.mjs`
- `test/unit/feishu-bridge.test.mjs`

已有能力：

- 使用 `@larksuiteoapi/node-sdk`：
  - `Lark.Client`
  - `Lark.WSClient`
  - `EventDispatcher`
- 支持 Feishu `im.message.receive_v1`。
- 只处理 `text` message。
- 群聊默认要求显式 @bot。
- 能解析 text content。
- 能根据 mentions/name 判断是否 @bot。
- 支持命令：
  - `/start`
  - `/help`
  - `/credits`
  - `/where`
  - `/stop`
  - `/goal` 提示去 CLI/Web
  - `/schedule` 提示去 CLI/Web
- 支持 users/credits/private chat lock。
- 支持 conversation log 和 run ledger。
- 支持 activeRuns map，单 routeKey 同时只允许一个运行。
- 有 processedMessageIds 去重。

当前限制：

- 不支持 Feishu 卡片。
- 不支持 card.action.trigger。
- 不支持 streaming card / patch / status cursor。
- 不支持 permission approval。
- 不支持 ask_user。
- 不支持 post 富文本。
- 不支持 image/file 下载。
- 不支持 topic/thread scope。
- 不支持 quoted message。
- 不支持 workspace switch / project aliases。
- 没有 Feishu 原生配置卡。
- 没有 callback token。
- 没有 owner/admin/group allowlist，更多是用户计费状态控制。

和两个开源项目对比：

- 相比 `agent-feishu-channel`：少了核心 Feishu agent 体验，包括卡片、权限 broker、provider SDK、session queue。
- 相比 `lark-coding-agent-bridge`：少了 profile、daemon、复杂访问控制、文档评论、callback 安全、pending queue、workspace policy。

差距评估：

- 如果只比较 Feishu bridge，CodexBridge 当前大约是两个开源项目的 **30%-40% 功能成熟度**。
- 如果比较完整产品，CodexBridge 有很多它们没有的运营和 workspace 能力，不能简单说落后。

### 7. Session routing

核心文件：

- `src/session-routing.mjs`
- Telegram/Feishu plugins 的 router state。

已有能力：

- direct session key：
  - `${channel}:user:${userId}`
- group session key：
  - `${channel}:chat:${chatId}:user:${userId}`
- group 里每个用户单独 session，避免互相串线。

优点：

- “公开群聊中保持每人私有 session”这个设计很有产品感。
- 避免群里 A 的上下文影响 B。

和两个开源项目对比：

- `agent-feishu-channel` 通常是 chat/session，适合团队共用一个 bot context。
- `lark-coding-agent-bridge` 更细，支持 topic/comment，并可基于 scope 继续。
- CodexBridge 的 user-in-group session 更偏“群内试用/商业化”，不是“团队协作同一 agent session”。

取舍：

- 你的设计适合 SaaS/credits/个人助手。
- 开源项目设计更适合团队协作 coding agent。

建议：

- 保留当前 user-in-group 模式。
- 增加可配置 chat mode：
  - `per_user`：当前模式。
  - `shared_chat`：整个群共享 session。
  - `topic`：按飞书话题分 session。

### 8. Billing、users、runs 和运营控制

核心文件：

- `src/users-state.mjs`
- `src/user-credits.mjs`
- `src/usage-ledger.mjs`
- `src/billing-service.mjs`
- `src/run-service.mjs`
- `src/runs-state.mjs`
- `src/admin-audit-log.mjs`
- `src/control-plane-operations-service.mjs`

已有能力：

- user state。
- paid credits。
- daily free quota。
- private chat unlock。
- banned status。
- usage ledger。
- run records：
  - queued
  - running
  - completed
  - failed
  - stopped
  - denied
- failed paid run 自动结算/退款。
- admin audit log。
- control-plane 操作用户和积分。

和两个开源项目对比：

- 这是 CodexBridge 明显领先的地方。
- 两个开源项目更像 developer tool，没有商业化/运营后台设计。

风险：

- 运营/计费能力做得早，但底层 Feishu agent 体验还浅；容易出现“商业包装先于核心体验”的错位。
- 如果要面向用户收费，权限审批、安全、稳定性要先补上。

可借鉴：

- 不需要从两个项目借这块。你这块反而可以作为差异化。
- 但 run records 要和更强的 RunExecutor/AgentEvent 接上，才能提供真实进度和工具审计。

### 9. Goals / schedules / long task

核心文件：

- `src/goal-controller.mjs`
- `src/goal-runner.mjs`
- `src/goals-state.mjs`
- `src/goal-prompts.mjs`
- `src/schedules-state.mjs`
- `src/schedule-intents.mjs`

已有能力：

- Goal record。
- Executor + supervisor 双循环。
- 最多 6 轮。
- evaluator JSON verdict：
  - continue
  - complete
  - blocked
  - failed
- stop requested。
- schedule state。
- Web 控制台启动 goal。

和两个开源项目对比：

- 两个开源项目没有类似长期 goal runner。
- 这是 CodexBridge 的重要差异化。

差距：

- goal runner 还是用 `codex exec` 子进程，缺少 tool/usage/event 级别可观测性。
- 和 IM channel 的交互闭环不完整，Feishu 里 `/goal` 目前只是提示去 CLI/Web。

建议：

- 暂时不要在 Feishu 里重做完整 goal UI。
- 先让 Feishu 能查看和停止 web/control-plane 中的 goal。
- 再做“goal progress card”。

### 10. Web control plane

核心文件：

- `src/control-plane-web.mjs`
- `src/control-plane-page.mjs`
- `src/control-plane-*`
- `src/web-chat-service.mjs`

已有能力：

- Bot list/detail。
- Bot lifecycle。
- Runtime logs。
- Workspace file read/write。
- Web chat。
- Quick test。
- Sessions。
- Goals。
- Schedules。
- Skills。
- Telegram pairing。
- Users/credits/runs/usage/admin audit。
- Config patch with secret redaction。

和两个开源项目对比：

- CodexBridge 强很多。两个项目基本没有管理后台。
- `lark-coding-agent-bridge` 的配置更多通过 CLI 和飞书卡片完成。
- `agent-feishu-channel` 靠 config file 和 slash commands。

风险：

- Web 控制面功能很多，但如果底层 channel/run 编排弱，控制面会像“仪表盘比发动机成熟”。

建议：

- 保留 Web 控制台优势。
- 把 Feishu 原生状态卡和 Web run detail 对齐，用户能从 IM 跳到 Web 看详情。

## 四、核心差距清单

### 差距 1：Feishu 原生交互太浅

CodexBridge 当前 Feishu 主要是 text reply。两个开源项目都把 Feishu 当成一等 UI：

- status card
- thinking card
- tool activity card
- permission card
- question card
- config card
- card action callback
- streaming element update
- patch fallback

这会造成体验差距：

- 用户看不到 agent 正在做什么。
- 工具调用不可审计。
- 长任务显得卡住。
- 无法在 Feishu 里审批工具。
- 无法用按钮完成确认、切目录、配置。

优先借鉴：

- `agent-feishu-channel` 的 status/thinking/tool/final card 分层。
- `lark-coding-agent-bridge` 的 callback HMAC + nonce。

### 差距 2：没有 provider-independent AgentEvent

CodexBridge 当前 runner 直接返回 output/status。两个项目都有更明确的 event stream。

缺失影响：

- Feishu 卡片无法稳定流式渲染。
- Web 控制台无法展示 tool timeline。
- run ledger 只能存结果，不能存过程。
- 权限审批难接入。

建议事件类型：

```text
run_started
status
text_delta
thinking_delta
tool_call_started
tool_call_finished
usage
done
error
```

### 差距 3：Run queue 策略偏粗

CodexBridge Feishu 现在 active run 时直接拒绝新请求，提示 busy。两个项目更细：

- `agent-feishu-channel`：session 内 queue，`!` 可中断并运行新请求。
- `lark-coding-agent-bridge`：pending debounce，run active 时 block，结束后合并 flush。

CodexBridge 当前问题：

- 用户连续发几条消息会被拒绝，而不是合并。
- 运行中补充上下文不自然。
- `/stop` 可以用，但没有 `/interrupt and run`。

建议：

- 引入 per-scope pending queue。
- active run 期间积累普通消息。
- run 结束后 quiet window flush。
- 加 `!<text>` 中断当前 run 并立即执行。

### 差距 4：权限审批体系缺失

CodexBridge 当前更像“只要用户有 credits/private access，就让 Codex 跑”。两个开源项目更关注 agent tool 权限。

缺失影响：

- 用户无法在 Feishu 里审批敏感操作。
- 不能区分 read-only/workspace/full。
- 商业化场景下风险高。

建议：

- 做 `PermissionBroker`：
  - request
  - resolveByCard
  - cancelAll
- Codex SDK 方式更容易接 approval policy。
- 如果继续 CLI，则先做粗粒度 permission mode。

### 差距 5：Feishu 消息类型支持不足

CodexBridge Feishu 只支持 text。

两个项目支持更多：

- `agent-feishu-channel` 支持 image/post。
- `lark-coding-agent-bridge` 支持 resources、attachments、quoted messages、interactive cards、comments。

建议优先级：

1. post 富文本扁平化。
2. image 下载为本地文件或 data URI。
3. file 下载到 workspace inbox。
4. quoted message。
5. topic/thread。
6. interactive card callback。

### 差距 6：安全 callback 缺失

CodexBridge 目前没有 Feishu card callback，所以还没暴露这个问题。一旦加按钮，不能只靠 `value: {cmd: ...}`。

建议直接借鉴 `lark-coding-agent-bridge`：

- HMAC token。
- TTL。
- nonce。
- operatorOpenId。
- scope。
- runId。
- policyFingerprint。
- replay store。

### 差距 7：访问控制模型偏商业化，不偏团队协作

CodexBridge 有 user/credits/private unlock/banned，这是优势。但团队 bot 还需要：

- owner
- admin
- allowed users
- allowed groups
- group mention policy
- unknown group hint

当前 Feishu 的 group access 更偏“任何群可用 daily free quota”，这适合增长/试用，但不适合企业内部部署。

建议：

- 保留 credits 模型。
- 增加 enterprise access layer：
  - bot owner
  - admins
  - allowed group ids
  - allowed private users
  - require mention

### 差距 8：工程边界还不够干净

CodexBridge 的 Telegram 和 Feishu 插件文件偏大，业务逻辑混在 transport 里。

典型混合点：

- message parsing
- command parsing
- billing
- session state
- Codex run
- rendering
- logs
- file upload/download

两个开源项目也有大文件，但边界更清楚：

- gateway
- translator
- session
- broker
- renderer
- provider
- persistence

建议：

- 新建 `src/channel-runtime/`：
  - `command-router.mjs`
  - `message-intake.mjs`
  - `run-coordinator.mjs`
  - `session-store.mjs`
  - `renderer-interface.mjs`
- Telegram 和 Feishu plugin 只保留 transport adapter。

## 五、CodexBridge 的优势

不能只看差距。你这套 AI 写出来的东西有几个很强的方向。

### 1. 你做的是 runtime，不只是 bridge

两个开源项目主要解决“飞书怎么接 coding agent”。CodexBridge 解决的是：

- assistant 放在哪里
- workspace 怎么持续
- 多 bot 怎么管理
- 用户和积分怎么管理
- 长任务怎么推进
- Web 控制台怎么操作
- 多 channel 怎么统一

这个方向更像产品平台。

### 2. 多渠道抽象已经有雏形

`channel-envelope.mjs` 虽然薄，但方向对。未来可以统一：

- Telegram
- Feishu
- Web
- CLI
- Slack/Discord/企业微信

两个开源项目在这方面没有优势。

### 3. 商业化模块先跑起来了

已有：

- users
- credits
- private unlock
- daily free
- billing ledger
- admin audit
- runs
- control-plane operations

这说明你已经在想“怎么运营”，不是只做 demo。

### 4. Web 控制台是差异化

飞书/Telegram 是入口，Web 控制台是运营和可视化。这两个开源项目缺这个。

如果补齐 Feishu 原生体验，CodexBridge 会比它们更像完整产品。

### 5. Goals / schedules 有长期助手潜力

两个开源项目还是 request/response coding agent。CodexBridge 的 goal runner 已经在尝试“持续推进任务”。

这是一个更大的产品方向。

## 六、AI 生成感体现在哪里

你的项目不是烂，但确实能看出 AI 快速生成的痕迹。

### 1. 产品面很宽，核心链路深度不均

Web、credits、goals、Telegram、Feishu、skills、runs 都有，但 Feishu 核心体验还浅。这是 AI 编程常见问题：横向铺得快，纵向打磨慢。

### 2. 插件文件过大

Telegram 和 Feishu 插件承担太多职责。长期维护会难。

### 3. 同类逻辑重复

例如 Telegram 和 Feishu 都有：

- pid file
- router state
- welcome/help
- credits
- active runs
- session
- run Codex

这些应该沉到共享 runtime。

### 4. 状态模型多套并存

你现在有：

- cli sessions
- router sessions
- run records
- goal sessions
- web chat runs
- bot runtime pid
- channel bridge pid

这些都合理，但缺一个统一的 state architecture 文档和 invariant。

### 5. Feishu 没有充分利用平台能力

当前 Feishu 像 Telegram text bot，而不是 Feishu-native bot。

这不是“AI 写不好”，而是没有针对 Feishu 平台深挖。

## 七、哪些应该借鉴

### 从 agent-feishu-channel 借鉴

优先级最高：

1. `FeishuGateway`
   - 官方 SDK WSClient。
   - event dedup。
   - access check。
   - message translator。
   - card action dispatcher。

2. `FeishuClient`
   - replyText/replyCard。
   - patchCard。
   - streamElementContent。
   - convertMessageIdToCardId。
   - downloadImage。

3. Card rendering pattern
   - status card。
   - thinking card。
   - tool activity card。
   - final answer fallback。
   - stream fail -> patch fallback。

4. `FeishuPermissionBroker`
   - tool call approval。
   - timeout。
   - warning reminder。
   - owner-only resolve。

5. `FeishuQuestionBroker` + `ask_user` MCP
   - 让 agent 在飞书里主动问用户选择题。

6. Codex SDK adapter
   - 用 `@openai/codex-sdk` 代替 shell JSONL 作为主路径。
   - 图片 data URI -> temp local image。

### 从 lark-coding-agent-bridge 借鉴

优先级最高：

1. Scope model
   - p2p。
   - group。
   - topic。
   - comment。

2. PendingQueue
   - quiet window。
   - active run block。
   - run 结束后 flush。

3. RunExecutor
   - active run lock。
   - process pool。
   - cleanup。
   - post-done exit grace。

4. Access control
   - owner。
   - admin。
   - allowed users。
   - allowed groups。
   - fail-closed owner refresh。

5. CallbackAuth
   - HMAC。
   - nonce。
   - TTL。
   - context binding。

6. Workspace policy
   - 拒绝 `/`、home、系统目录、tmp root 等危险目录。

7. SessionCatalog
   - scope + provider + cwd + policy fingerprint + session/thread id。

8. lark-cli profile isolation
   - 未来让 agent 操作飞书文档/表格时很重要。

## 八、建议改造路线

### Phase 1：把 Feishu 从 text bot 升级成 Feishu-native bot

目标：用户在飞书里能看到“正在做什么”和最终结果，不再像普通文本机器人。

任务：

1. 抽 `FeishuGateway`。
2. 抽 `FeishuClient`。
3. 支持 text/post/image。
4. 引入 status card。
5. 引入 final answer card + text fallback。
6. 让 `codex-runner` 输出统一 event。
7. 在 run record 里存 event timeline。

### Phase 2：补 run/session 编排

目标：用户连续发消息不会被粗暴拒绝，运行可停止、可排队、可中断。

任务：

1. 新建 `RunCoordinator`。
2. per-scope active lock。
3. per-scope pending queue。
4. `/stop` 停当前 scope。
5. `!<text>` 中断并运行。
6. session key 支持 mode：
   - per_user
   - shared_chat
   - topic

### Phase 3：权限与安全

目标：可以放心给团队使用。

任务：

1. PermissionBroker。
2. Feishu approval card。
3. callback HMAC token。
4. nonce store。
5. workspace policy。
6. owner/admin/group allowlist。
7. Feishu config page/card 或 Web 配置联动。

### Phase 4：Provider adapter

目标：Codex、Claude、未来 OpenCode/Gemini 都能接。

任务：

1. 定义 `AgentAdapter`。
2. 定义 `AgentEvent`。
3. Codex SDK adapter。
4. Codex CLI fallback adapter。
5. Claude SDK/CLI adapter。
6. provider-specific permission mapping。

### Phase 5：产品差异化合流

目标：把你已有的大产品能力接到飞书原生体验里。

任务：

1. Feishu 里查看 runs。
2. Feishu 里查看 credits。
3. Feishu 里启动/查看/停止 goal。
4. Goal progress card。
5. Web 控制台 run detail 和 Feishu card 互链。
6. Feishu 文件上传到 workspace inbox。
7. 生成文件后发送回飞书。

## 九、横向功能矩阵

| 功能 | CodexBridge | agent-feishu-channel | lark-coding-agent-bridge |
|---|---|---|---|
| 多 bot | 有 | 无 | profile 形式有 |
| 多 channel | Telegram/Feishu/Web/CLI | Feishu | Feishu/Lark |
| Web 控制台 | 强 | 无 | 弱/无 |
| 用户/积分/计费 | 强 | 无 | 无 |
| Runs ledger | 有 | session status 为主 | observability/log 为主 |
| Goals/schedules | 有 | 无 | 无 |
| Workspace seed/memory | 强 | 中 | 中 |
| Feishu text | 有 | 有 | 有 |
| Feishu post | 无 | 有 | 依赖 channel/resources |
| Feishu image | 无 | 有 | 有附件处理 |
| Feishu file | 无 | 弱 | 有附件处理 |
| Feishu card streaming | 无 | 强 | 强 |
| Feishu permission card | 无 | 强 | 中强 |
| Feishu ask_user | 无 | 强 | 可通过 callback 协议扩展 |
| Feishu config card | 无 | `/config` text + cards | 强 |
| Feishu topic | 无 | 弱 | 强 |
| Feishu document comment | 无 | 无 | 强 |
| Callback HMAC | 无 | 无 HMAC，owner 校验 | 强 |
| Pending queue | busy 拒绝 | session queue | debounce + block |
| Interrupt | `/stop` | `/stop` + `!` | `/stop` + command interrupt |
| Provider SDK | 无，shell CLI | Claude/Codex SDK | CLI adapter + JSONL |
| Agent event abstraction | 弱 | 强 | 强 |
| Workspace safety | 基础路径处理 | `/cd` 确认 | 强 denylist |
| App/process lock | pid file | 无明显系统级 | 强 profile/app lock |
| 测试数量 | 有较多 unit | 578 tests | 512 tests |

## 十、差距到底有多大

如果问“纯 AI 写的和正经开源项目差距有多少”，我的判断是：

### 作为完整产品原型

CodexBridge 已经达到 **开源项目原型中上水平**。它不是随手脚本，有多 bot、web、billing、runs、goals、workspace、测试。

差距不是“有没有东西”，而是“核心链路是否足够深、边界是否足够稳”。

### 作为 Feishu coding-agent bridge

CodexBridge 目前只到 **早期 MVP**。和这两个项目比，差距大约是：

- `agent-feishu-channel`：落后 2-3 个工程迭代。
- `lark-coding-agent-bridge`：落后 4-6 个工程迭代。

主要落后在：

- 卡片交互。
- 权限审批。
- session/run 状态机。
- Feishu message type。
- callback 安全。
- provider SDK/event stream。
- 话题/评论/附件。

### 作为 assistant runtime

CodexBridge 反而领先一些，因为两个项目没有：

- 商业化用户系统。
- credits。
- Web 控制台。
- goals/schedules。
- multi-channel。
- assistant identity workspace。

这说明你的方向有价值，但需要把 Feishu 入口从“接上了”做到“好用、可信、可运营”。

## 十一、最值得立刻做的 15 件事

按投入产出排序：

1. 抽出 shared `ChannelRuntime`，减少 Telegram/Feishu 重复。
2. 扩展 `ChannelEnvelope`：threadId、mentions、senderType、attachments、quote。
3. 为 Feishu 增加 message translator：text/post/image。
4. 引入统一 `AgentEvent`。
5. 改造 `codex-runner` 输出事件流，而不只是 final output。
6. Feishu 增加 status card。
7. Feishu 增加 final answer card + text fallback。
8. Feishu 增加 tool activity card。
9. 实现 per-scope pending queue。
10. 加 `!<text>` interrupt-and-run。
11. 实现 PermissionBroker + Feishu approval card。
12. 实现 callback HMAC + nonce。
13. 增加 owner/admin/allowed groups。
14. 引入 workspace safety policy。
15. 做 Codex SDK adapter。

## 十二、最终建议

不要因为重名或竞品成熟就推倒重来。CodexBridge 的定位可以避开“又一个 Feishu Claude/Codex bridge”：

推荐定位：

> CodexBridge is a local-first AI assistant runtime with persistent workspaces, web operations, and IM channels. Feishu/Lark is one native control surface, not the whole product.

工程策略：

- 保留你的多 bot、workspace、web、credits、goals。
- 把 Feishu bridge 当成当前最大短板重点补。
- 不要照搬两个项目的大代码，但直接借鉴它们的边界和协议：
  - `Gateway`
  - `Translator`
  - `RunCoordinator`
  - `AgentAdapter`
  - `PermissionBroker`
  - `CardRenderer`
  - `CallbackAuth`

如果按上面的 Phase 1-3 做完，CodexBridge 的 Feishu 体验会接近 `agent-feishu-channel`；再做 profile/app lock/topic/comment/lark-cli isolation，才会接近 `lark-coding-agent-bridge`。

当前最现实的目标不是一次追平两个开源项目，而是先做到：

> CodexBridge 在 Feishu 群里可见进度、可审批工具、可稳定停止/排队，并且能把 Web 控制台、credits、workspace 和 goals 串起来。

这会形成你自己的差异化，而不是只做它们的复刻。
