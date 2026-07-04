# Feishu/Lark Coding-Agent Bridge 竞品源码分析

分析对象：

- `zarazhangrui/lark-coding-agent-bridge`，本地目录：`/Users/moshiwei/Documents/GitHub/01_AI_Agents_LLM/lark-coding-agent-bridge`
- `Blackman99/agent-feishu-channel`，本地目录：`/Users/moshiwei/Documents/GitHub/01_AI_Agents_LLM/agent-feishu-channel`

验证状态：

- `lark-coding-agent-bridge`: `pnpm test` 通过，87 个测试文件、512 个测试；`pnpm typecheck` 通过；安装阶段触发 `prepare` 并构建成功。
- `agent-feishu-channel`: `pnpm test` 通过，39 个测试文件、578 个测试；`pnpm typecheck` 通过；`pnpm build` 通过。

## 一、总体判断

这两个项目代表了两种不同路线：

| 维度 | lark-coding-agent-bridge | agent-feishu-channel |
|---|---|---|
| 产品形态 | 完整 CLI 产品，带 profile、daemon、扫码创建/绑定 PersonalAgent、权限、工作区、文档评论、进程管理 | 较轻的服务进程，配置文件驱动，直接接 Feishu WebSocket 和 Claude/Codex SDK |
| 飞书接入 | 使用 `@larksuite/channel` 高层 channel SDK | 使用 `@larksuiteoapi/node-sdk` 的 `WSClient`、`EventDispatcher` 和 REST client |
| Agent 接入 | 主要通过本地 CLI subprocess，Claude stream-json，Codex JSONL / app-server 相关能力 | Claude 走 `@anthropic-ai/claude-agent-sdk`，Codex 走 `@openai/codex-sdk` |
| 会话模型 | scope + session catalog：区分 p2p、普通群、话题群、文档评论；Claude session / Codex thread 双索引 | chat/project/provider 三维 session key，状态机内置 queue / interrupt / provider 切换 |
| 安全模型 | 更重：owner/admin/用户/群白名单、工作目录策略、权限指纹、callback HMAC token + nonce、防 replay、secret keystore | 更轻：allowed_open_ids 白名单、权限卡 owner 校验、配置文件控制 |
| 交互体验 | 流式卡片、工具卡、状态渲染、命令卡、配置卡、账号切换卡、文档评论回复 | 状态卡、thinking 卡、tool activity 卡、权限卡、问题卡、最终答案卡 |
| 对 AutoAide 借鉴价值 | 架构、产品化、权限边界、profile/daemon、文档评论、lark-cli 环境隔离 | Provider SDK 抽象、权限 broker、ask_user MCP、卡片流式渲染、配置热更新 |

结论：

- 如果 AutoAide 要做“可发布给用户安装”的飞书入口，`lark-coding-agent-bridge` 更值得作为产品架构参考。
- 如果 AutoAide 要快速做“飞书群里调 Claude/Codex 并审批工具”的核心闭环，`agent-feishu-channel` 更容易吸收。
- 最优方案不是照搬其中一个，而是组合：用第一个的 profile/访问控制/工作区/daemon 边界，用第二个的 provider SDK + broker + card streaming 的实现思路。

## 二、lark-coding-agent-bridge 模块分析

### 1. CLI 与启动模块

核心文件：

- `src/cli/index.ts`
- `src/cli/commands/start.ts`
- `src/cli/commands/service.ts`
- `src/cli/commands/profile.ts`
- `src/cli/commands/migrate.ts`
- `src/daemon/*`

功能点：

- 提供两层启动模型：
  - `run`: 前台运行，适合首次配置、调试。
  - `start/stop/restart/status/unregister`: OS daemon 管理，macOS launchd、Linux systemd、Windows Task Scheduler。
- 支持 profile 管理：
  - `profile create/list/use/remove/export`
  - 每个 profile 独立 app credentials、agent 类型、工作目录、日志、session、lark-cli 配置。
- 支持迁移：
  - legacy config -> profile v2。
  - 迁移时能检测旧进程并提示停止，避免多个 bridge 争抢同一个飞书应用。
- 启动前做 preflight：
  - agent binary 检查。
  - lark-cli 配置检查。
  - profile runtime 解析。
  - app/profile runtime lock。

架构价值：

- “profile 是产品边界”这个设计很重要。用户一台机器可能同时跑 Claude bot、Codex bot、不同团队 bot，不应该共享状态。
- daemon 管理是从工具到产品的关键一步，尤其适合“IM 入口常驻后台”。
- runtime lock + app conflict detection 防止同一个 app 被多个进程连接，避免飞书事件随机分发到不同进程。

可借鉴：

- AutoAide 应引入 profile 概念，至少包含 `profileName/appId/provider/workspace/stateDir/logDir`。
- 启动时必须做 “同 app 单实例锁”，否则群聊里会出现多个实例抢答或漏答。
- daemon 不一定第一版做全平台，但 macOS launchd/systemd 至少要规划接口。

### 2. 配置、密钥和 profile 模块

核心文件：

- `src/config/schema.ts`
- `src/config/profile-schema.ts`
- `src/config/profile-store.ts`
- `src/config/keystore.ts`
- `src/config/secret-resolver.ts`
- `src/config/permissions.ts`
- `src/config/app-paths.ts`

功能点：

- root config 管 profiles，active profile 独立保存。
- profile 内含：
  - app credentials
  - agent kind
  - permissions
  - workspaces
  - preferences
  - lark-cli identity policy
- app secret 可来自：
  - 明文
  - 环境变量
  - 文件
  - 加密 keystore
  - exec-provider 协议
- 权限模式统一抽象：
  - `full`
  - `workspace`
  - `read-only`
  - 映射到 Claude permission mode 和 Codex sandbox mode。

架构价值：

- 配置 schema 和 profile schema 分层，便于兼容老版本。
- secret resolver 很值得借鉴：不要让业务层关心 secret 来源。
- 权限用统一 bridge access mode 抽象，再映射到不同 agent，非常适合多 provider。

可借鉴：

- AutoAide 不应把飞书 app secret、Codex config、workspace 写死在一个 `.env` 里。
- 建议设计 `SecretRef`：
  - `{source:"env", id:"AUTOAIDE_FEISHU_SECRET"}`
  - `{source:"file", path:"..."}`
  - `{source:"inline", value:"..."}`
  - 未来加 encrypted local store。

### 3. 飞书 Channel 与消息 intake

核心文件：

- `src/bot/channel.ts`
- `src/bot/chat-mode-cache.ts`
- `src/bot/group.ts`
- `src/bot/quote.ts`
- `src/bot/comment-resource.ts`
- `src/bot/comments.ts`
- `src/bot/reaction.ts`
- `src/bot/lark-info.ts`

功能点：

- 基于 `@larksuite/channel` 创建 `LarkChannel`。
- 配置：
  - `dmMode: open`
  - group 默认 require mention
  - `respondToMentionAll: false`
  - 禁用 SDK 内置 chatQueue，自己实现 pending queue。
- intake 流程：
  1. 收到 normalized message。
  2. 解析 chat mode：p2p、group、topic。
  3. 构造 scope：普通 chat 用 `chatId`，话题群用 `chatId:threadId`。
  4. 做访问控制。
  5. 做群 @bot 策略。
  6. 尝试处理 slash command。
  7. 普通消息进入 pending debounce queue。
- 支持 quoted message：
  - 普通群 reply quote 会注入 quoted context。
  - topic root quote 做特殊处理，避免重复引用话题根。
- 支持云文档评论 @bot 触发。
- 支持 working reaction，给用户“正在处理”的即时反馈。

架构价值：

- scope 是核心抽象。飞书里 p2p、群、话题、文档评论都不是同一种会话，必须有统一 scope key。
- 命令绕过普通消息队列，保证 `/stop`、`/cd`、`/new` 及时响应。
- 群聊默认 require mention 是正确产品策略：减少误触发和成本。

可借鉴：

- AutoAide 的飞书入口必须先定义 scope：
  - `dm:<chatId>`
  - `group:<chatId>`
  - `topic:<chatId>:<threadId>`
  - `comment:<fileToken>:<commentId>`
- 普通消息应 debounce 合并；命令应立即执行。
- 群里不要响应 `@all`，只响应结构化 mention 到 bot。

### 4. PendingQueue、并发池和运行控制

核心文件：

- `src/bot/pending-queue.ts`
- `src/bot/active-runs.ts`
- `src/bot/process-pool.ts`
- `src/runtime/run-executor.ts`
- `src/bot/run-flow.ts`

功能点：

- `PendingQueue`：
  - 每个 scope 独立 debounce。
  - 默认 600ms quiet window。
  - active run 期间 block scope，新消息继续累积，run 结束后重新开始 quiet window。
- `ActiveRuns`：
  - 每个 scope 同时只允许一个 agent run。
  - bridge disconnect 时暂停新 run，停止所有 active run。
- `ProcessPool`：
  - 全局并发限制，配置可动态读取。
- `RunExecutor`：
  - 统一 runId、spawn、active registration、cleanup、post-done exit grace。
  - 处理 terminal event 到进程退出之间的短暂 tail，避免误杀正常退出进程。
- `run-flow`：
  - 先 resolve workspace。
  - 再 evaluate run policy。
  - 再查 session catalog，决定 Claude resume session 或 Codex thread。
  - 最后提交给 executor。

架构价值：

- IM 消息和 agent run 的节奏完全不同，必须用 pending queue 隔离。
- “run 结束后再 flush 运行期间的新消息”比“边运行边插队”稳定。
- 统一 RunExecutor 能把 Claude/Codex 的差异压到 adapter 层。

可借鉴：

- AutoAide 应实现：
  - per-scope active run lock
  - per-scope pending queue
  - global concurrency pool
  - stop grace
  - run terminal + process exit 双阶段 cleanup

### 5. Agent Adapter 模块

核心文件：

- `src/agent/types.ts`
- `src/agent/capability.ts`
- `src/agent/bridge-system-prompt.ts`
- `src/agent/prompt.ts`
- `src/agent/claude/adapter.ts`
- `src/agent/claude/stream-json.ts`
- `src/agent/codex/adapter.ts`
- `src/agent/codex/jsonl.ts`
- `src/agent/lark-channel-env.ts`

功能点：

- 定义统一 `AgentAdapter`：
  - `id`
  - `displayName`
  - `checkAvailability`
  - `prepareRun`
  - `run`
  - `setBotIdentity`
- 统一 `AgentEvent`：
  - `system`
  - `text`
  - `thinking`
  - `tool_use`
  - `tool_result`
  - `usage`
  - `done`
  - `error`
- Claude adapter：
  - spawn `claude -p ... --output-format stream-json --verbose`
  - 用 `--append-system-prompt` 注入 bridge system prompt。
  - 支持 `--resume sessionId`。
- Codex adapter：
  - 通过 JSONL 翻译 Codex thread events。
  - 支持 threadId、images、sandbox。
- Bridge prompt：
  - 注入 `<bridge_context>`、`<quoted_messages>`、`<interactive_cards>`、`<comment_context>`、`<user_input>`。
  - 明确告知 agent 如何使用 lark-cli、如何处理 bot-at-bot、如何发可回调卡片。
- lark-channel-env：
  - 给子进程注入 `LARK_CHANNEL=1`、`LARK_CHANNEL_PROFILE`、`LARK_CHANNEL_HOME`、`LARKSUITE_CLI_CONFIG_DIR`。

架构价值：

- `AgentEvent` 统一得很好，渲染层完全不关心 provider。
- bridge system prompt 很重要，它不是普通系统提示，而是“运行环境协议”。
- lark-cli 私有 profile 环境是一个高价值设计：agent 可以反向操作飞书，但不会污染用户本机普通 lark-cli 配置。

可借鉴：

- AutoAide 应定义 provider-independent event stream：
  - status/text/thinking/tool/usage/done/error
- 对 CodexBridge 来说，系统提示应明确：
  - 当前 chat/scope
  - sender
  - bot open_id
  - mentions
  - quoted message
  - attachment local paths
  - callback token 规则

### 6. 卡片、回调和渲染模块

核心文件：

- `src/card/run-renderer.ts`
- `src/card/run-state.ts`
- `src/card/text-renderer.ts`
- `src/card/tool-render.ts`
- `src/card/templates.ts`
- `src/card/dispatcher.ts`
- `src/card/callback-auth.ts`
- `src/card/callback-store.ts`
- `src/card/config-card.ts`
- `src/card/account-cards.ts`

功能点：

- run renderer 将 `AgentEvent` reduce 成卡片状态。
- tool-render 负责工具调用摘要。
- config-card/account-card 用飞书 CardKit 2.0 提供表单。
- card dispatcher 分发：
  - 内置命令卡片按钮。
  - agent 发出的 bridge callback。
- callback-auth：
  - HMAC 签名 token。
  - token 含 runId、scope、chatId、operatorOpenId、action、policyFingerprint、expiry、nonce、key version。
  - verify 时检查签名、过期、上下文、nonce replay。
- callback-store：
  - 本地持久化 used/revoked nonce。

架构价值：

- 这是第一个项目最值得学习的安全设计。IM 卡片按钮不能只靠 `value` 里的 action 字段，否则任何人都可能伪造/重放。
- callback token 绑定 policy fingerprint，避免用户点击旧卡片在新权限上下文里生效。

可借鉴：

- AutoAide 做飞书按钮时，必须做 callback token：
  - HMAC
  - TTL
  - nonce
  - operator open_id
  - scope
  - run id
  - policy fingerprint
- 所有按钮都应是 “授权动作”，不是“裸命令”。

### 7. 访问控制、工作区和安全策略

核心文件：

- `src/policy/access.ts`
- `src/policy/owner.ts`
- `src/policy/run-policy.ts`
- `src/policy/workspace.ts`
- `src/policy/fingerprint.ts`

功能点：

- access：
  - owner 永远可用，避免锁死自己。
  - admin 可管理。
  - allow users 控制私聊。
  - allow chats 控制群。
  - 未授权群 @bot 时给友好提示，其他未授权消息静默。
- owner：
  - 定期刷新飞书 app owner。
  - 刷新失败时有 fail closed / cached owner 策略。
- workspace：
  - 拒绝 `/`、home 根、系统目录、临时目录根等过宽目录。
- run-policy：
  - 将 prompt、attachments、access、cwd、permissions、agent capability 组合成一次 run policy。
  - 产生 policy fingerprint。

架构价值：

- 工作目录策略是 IM agent 的硬边界之一。用户在群里发 `/cd /` 是高风险动作。
- owner/admin/group/user 四层访问控制比单一 allowed_open_ids 更适合团队产品。

可借鉴：

- AutoAide 第一版至少做：
  - owner
  - admin
  - allowed users
  - allowed groups
  - require mention in group
  - workspace denylist

### 8. 会话、历史和工作区模块

核心文件：

- `src/session/store.ts`
- `src/session/catalog.ts`
- `src/session/history.ts`
- `src/session/codex-history.ts`
- `src/session/preview.ts`
- `src/workspace/store.ts`

功能点：

- `SessionStore` 保存 scope -> Claude sessionId/cwd/idle timeout。
- `SessionCatalog` 是 agent-aware 的索引：
  - scopeId
  - agentId
  - cwdRealpath
  - policyFingerprint
  - sessionId/threadId
- Claude history 从 `~/.claude/projects/...` 的 jsonl 读取。
- Codex history 通过 Codex app-server 协议查询 thread list。
- WorkspaceStore 保存 chat/scope 当前 cwd 和 named workspaces。

架构价值：

- 单纯 `chatId -> sessionId` 不够，因为 provider、cwd、权限策略变化都会影响是否可 resume。
- policy fingerprint 是避免错误续接的重要机制。

可借鉴：

- AutoAide 的 resume key 应至少包含：
  - platform
  - scope
  - provider
  - workspace realpath
  - permission mode
  - model/profile

### 9. 媒体与附件模块

核心文件：

- `src/media/cache.ts`
- `src/media/attachment.ts`

功能点：

- 从飞书下载图片/文件到本地 cache。
- 附件转成 policy attachment 和 prompt attachment。
- 媒体缓存有 GC。
- Codex 图片走单独 path list，Claude 通过 prompt/附件表达。

架构价值：

- 附件既是输入能力，也是安全边界。需要记录来源、大小、hash、requiredness、accept/reject decision。

可借鉴：

- AutoAide 附件处理不要只把文件路径塞给 agent，应保留：
  - source message id
  - mime
  - size
  - hash
  - local cache path
  - policy decision

### 10. 可观测性和韧性

核心文件：

- `src/core/logger.ts`
- `src/core/telemetry.ts`
- `src/bot/keepalive.ts`
- `src/runtime/registry.ts`
- `src/runtime/locks.ts`

功能点：

- 结构化日志。
- 敏感字段脱敏。
- telemetry adapter 可选。
- WS reconnect 计数，连续重连时 stdout 提醒。
- keepalive 探测和强制 reconnect。
- process registry 记录本机 bridge 进程。
- runtime locks 保护 profile/app。

架构价值：

- IM bridge 是常驻进程，不能只靠 console.log。
- 日志脱敏非常必要，飞书 event、app secret、token、文件路径都可能泄漏。

可借鉴：

- AutoAide 应实现结构化日志 + redaction，从第一版就做。

## 三、agent-feishu-channel 模块分析

### 1. CLI 和配置模块

核心文件：

- `src/cli.ts`
- `src/config.ts`
- `config.example.toml`

功能点：

- CLI 很薄：
  - `afc init`
  - `afc`
  - `--config`
  - `--version`
  - `--help`
- 自动迁移旧目录：
  - `~/.claude-feishu-channel` -> `~/.agent-feishu-channel`
- 配置使用 TOML。
- 配置 section：
  - `[feishu]`
  - `[access]`
  - `[agent]`
  - `[claude]`
  - `[codex]`
  - `[render]`
  - `[persistence]`
  - `[logging]`
  - `[projects]`
  - `[[mcp]]`
- 支持 `/config set` 运行时修改部分配置，可选 `--persist` 写回文件。

架构价值：

- 轻量配置适合开发者工具，不需要复杂 profile。
- TOML 对用户可读性高。
- 运行时配置修改体验好，尤其是 render、model、effort、permission timeout。

可借鉴：

- 如果 AutoAide 先做 MVP，可以先用 TOML/JSON 单 profile；后续再扩展 profiles。
- `/config set key value --persist` 是很实用的飞书内配置闭环。

### 2. Feishu Gateway 和消息翻译

核心文件：

- `src/feishu/gateway.ts`
- `src/feishu/client.ts`
- `src/feishu/message-translator.ts`
- `src/feishu/post-parser.ts`
- `src/feishu/image-mime.ts`
- `src/feishu/types.ts`

功能点：

- 使用官方 `@larksuiteoapi/node-sdk`：
  - `WSClient`
  - `EventDispatcher`
  - `Client`
- 订阅：
  - `im.message.receive_v1`
  - `card.action.trigger`
- gateway 负责：
  - dedup message_id
  - access control
  - unauthorized reject 时回 open_id
  - translate event
  - handler error catch
- message translator 支持：
  - text
  - image 下载为 data URI
  - post 富文本扁平化
  - post 内联图片下载
- FeishuClient 封装：
  - reply text/card
  - send text/card
  - patch card
  - stream element content
  - id convert
  - download image

架构价值：

- 直接用官方 SDK 可控性高，事件字段透明。
- gateway 只做 transport concern，业务交给 session/command，这个边界清楚。

不足：

- 当前 ReceiveV1Event 类型只声明了必要字段，未建模 mentions/chat_type/thread/root_id 等群/话题高级能力。
- 访问控制只看 sender open_id，没有 group allowlist。

可借鉴：

- AutoAide 如果不想依赖高层 channel SDK，可采用这种官方 SDK 直连路线。
- 事件 translator 应独立成纯转换层，便于测试。

### 3. Access Control

核心文件：

- `src/access.ts`

功能点：

- allowed open_ids 白名单。
- unauthorized 行为：
  - `ignore`
  - `reject`
- reject 时把发送者 open_id 发回，便于首次配置。

架构价值：

- 简单直接，非常适合 MVP。

不足：

- 不区分 owner/admin/user/group。
- 没有群白名单和 mention 策略。
- 没有 app owner 自动发现。

可借鉴：

- AutoAide 可先实现此最小模型，但要预留升级到 owner/admin/group。

### 4. Session 和队列状态机

核心文件：

- `src/claude/session.ts`
- `src/claude/session-manager.ts`
- `src/persistence/state-store.ts`

功能点：

- `ClaudeSession` 是核心状态机：
  - `idle`
  - `generating`
  - `awaiting_permission`
- submit 支持：
  - run
  - stop
  - interrupt_and_run
  - queued
- `!<text>` 中断当前 turn、清空队列，并立即执行新输入。
- `/stop` 中断当前 turn，并 drop queue。
- 内置：
  - provider 切换
  - permission mode override
  - model override
  - effort override
  - token usage
  - context warning
  - retained continuation state
  - recent context handoff
- `ClaudeSessionManager`：
  - session key = `chatId\tprojectAlias\tprovider`
  - active project per chat
  - active provider per chat/project
  - stale records 恢复
  - TTL 清理
  - crash recovery 通知
  - debounced state save
- StateStore：
  - versioned JSON state。
  - lastCleanShutdown。
  - sessions、activeProjects、activeProviders。

架构价值：

- session 内建队列比第一个项目的外部 pending queue 简单，但把很多逻辑集中到 `ClaudeSession`，文件较大。
- `!` prefix 中断很好用，适合 IM 场景。
- crash recovery 用户通知很实用。

可借鉴：

- AutoAide 可以引入 `!` 前缀作为“打断并重提问”。
- session persistence 应保存 clean/unclean shutdown，重启后提示用户上一轮可能不完整。

### 5. Provider 接入

核心文件：

- `src/claude/sdk-query.ts`
- `src/claude/query-handle.ts`
- `src/codex/sdk-run.ts`
- `src/codex/preflight.ts`
- `src/claude/preflight.ts`
- `src/agent/manager.ts`

功能点：

- Claude：
  - 使用 `@anthropic-ai/claude-agent-sdk`。
  - 通过 `canUseTool` 接入 permission broker。
  - 注入 MCP servers。
  - 禁用/替换内置 ask user。
- Codex：
  - 使用 `@openai/codex-sdk`。
  - 将 Claude-like content 转成 Codex `UserInput`。
  - 图片 data URI 写入临时文件，再作为 `local_image` 传给 Codex。
  - permission mode 映射：
    - `plan` -> `on-request` + `read-only`
    - `bypassPermissions` -> `never` + `danger-full-access`
    - `acceptEdits` -> `on-failure` + `workspace-write`
    - `default` -> `on-request` + `workspace-write`
  - 将 Codex thread events 转成 ClaudeSession 能消费的 SDKMessageLike。

架构价值：

- 这个项目的最大价值是“用 SDK 而非 CLI stdout 协议”统一 provider。
- 将 Codex 事件映射成 Claude-like message，复用现有 session/render 管线，降低改造成本。

可借鉴：

- AutoAide 若基于 Codex SDK，应该优先参考 `src/codex/sdk-run.ts`。
- 图片处理临时文件化是 Codex 多模态输入的实用方案。

### 6. Permission Broker 和 Question Broker

核心文件：

- `src/claude/permission-broker.ts`
- `src/claude/feishu-permission-broker.ts`
- `src/claude/question-broker.ts`
- `src/claude/feishu-question-broker.ts`
- `src/claude/ask-user-mcp.ts`

功能点：

- Permission broker：
  - 每个 tool call 发权限卡。
  - pending request 用 requestId 管理。
  - ownerOpenId 校验，只有触发用户能点。
  - 支持 allow、deny、allow_turn、allow_session。
  - timeout auto deny。
  - warn reminder。
  - `/stop` 或中断时 cancelAll。
  - 点击后通过 card callback response 直接更新卡片。
- Question broker：
  - agent 可通过 `mcp__feishu__ask_user` 问用户选择题。
  - 1-4 个问题，每题 2-4 个选项。
  - 卡片多步点击，全部答完才 resolve。
  - timeout/cancel 处理。
- ask-user MCP：
  - 每 turn 构造一个 in-process MCP server。
  - 把 Feishu chat/owner/parentMessageId 绑定到 tool handler。

架构价值：

- 这是 `agent-feishu-channel` 最值得直接借鉴的模块。
- Permission broker 将 provider 的 tool approval 和 IM 卡片交互解耦，接口干净。
- ask_user MCP 让 agent 主动澄清需求，产品体验明显优于“请你回复文字”。

可借鉴：

- AutoAide 应实现 `PermissionBroker` 接口：
  - `request(toolCall) -> Promise<PermissionResponse>`
  - `resolveByCard`
  - `cancelAll`
- 后续可做 `AskUserBroker`，让 Codex/Claude 在飞书里发选择题。

### 7. 命令模块

核心文件：

- `src/commands/router.ts`
- `src/commands/dispatcher.ts`

功能点：

- router 是纯函数，解析：
  - `/new`
  - `/stop`
  - `/status`
  - `/cost`
  - `/context`
  - `/compact`
  - `/sessions`
  - `/projects`
  - `/resume <id>`
  - `/cd <path>`
  - `/project <alias>`
  - `/provider <claude|codex>`
  - `/mode <mode>`
  - `/model <name>`
  - `/effort <level>`
  - `/config show`
  - `/config set <key> <value> [--persist]`
  - `/memory`
  - `/memory add <text>`
- `/cd` 使用确认卡，避免误切目录。
- `/memory` 根据 provider 读取/写入不同记忆文件：
  - Claude: `CLAUDE.md`
  - Codex: `AGENTS.md`
- `/config set` 支持 runtime config update 和可选持久化。

架构价值：

- router 纯函数非常好测。
- dispatcher 承担 I/O 和状态变更。
- `/memory add` 很值得借鉴，能把 IM 里的经验沉淀回项目。

可借鉴：

- AutoAide 的命令模块也应拆成 parser/router 和 dispatcher。
- `/memory add` 可作为 AutoAide 的差异化功能。

### 8. 卡片渲染模块

核心文件：

- `src/feishu/cards.ts`
- `src/feishu/cards/permission-card.ts`
- `src/feishu/cards/question-card.ts`
- `src/feishu/cards/cd-confirm-card.ts`
- `src/feishu/final-reply.ts`
- `src/feishu/tool-formatters.ts`
- `src/feishu/tool-result.ts`
- `src/feishu/truncate.ts`
- `src/feishu/messages.ts`

功能点：

- 每 turn 最多几张核心卡：
  - status card
  - thinking card
  - tool activity card
  - intermediate replies card
  - final answer card
- streaming 策略：
  - 先 reply card。
  - message_id 转 card_id。
  - streamElementContent 更新稳定 element_id。
  - 失败后 fallback 到 patchCard。
  - 某类卡持续失败后 latch disabled，不影响最终答案。
- text blocks 策略：
  - 中间文本块折叠成 intermediate replies。
  - 最后一个文本块作为 final answer。
- truncate/sanitize：
  - markdown image demote，避免飞书卡片因非法 image key 失败。
  - 按 UTF-8 bytes 截断。

架构价值：

- “状态卡作为 live cursor，thinking/tool 作为可展开审计，最终答案单独可读”是很好的 IM 体验。
- 卡片失败不应影响最终答案，这是稳定性关键。

可借鉴：

- AutoAide 飞书渲染应分层：
  - live status
  - tool audit
  - final answer
- 必须做 Feishu markdown sanitize，尤其是 `![alt](url)`。

### 9. 工具、MCP 和上下文处理

核心文件：

- `src/claude/ask-user-mcp.ts`
- `src/claude/session.ts`
- `src/feishu/tool-formatters.ts`

功能点：

- 对工具调用做用户友好摘要：
  - Read -> file:line range
  - Edit/Write -> file path / bytes
  - Bash -> `$ command`
  - Grep -> pattern/glob
- context handling：
  - warn 阶段。
  - 50MB hard fallback。
  - `/context` 查看状态。
  - `/compact` 清理。

架构价值：

- tool 展示不是原样 JSON，而是专门为 IM 阅读做摘要。
- context 风险前置告警，比等 provider 报错更好。

可借鉴：

- AutoAide 应做 tool formatter，不要把 raw tool JSON 直接给用户。
- 对 Codex context/token/usage 做 `/context` 和 `/cost`。

## 四、功能点对照清单

| 功能 | lark-coding-agent-bridge | agent-feishu-channel | AutoAide 建议 |
|---|---|---|---|
| 飞书私聊 | 支持 | 支持 | 必做 |
| 飞书群 @bot | 支持，默认 require mention | README 主打群聊，但 gateway 当前主要按 chat_id 处理 | 必做，默认 require mention |
| 话题群 scope | 支持 `chatId:threadId` | 未充分建模 | 第二阶段做 |
| 文档评论 @bot | 支持 | 不支持 | 差异化功能，后做 |
| 流式状态 | 支持 | 支持且细节丰富 | 必做 |
| 工具调用卡 | 支持 | 支持 | 必做 |
| 权限审批 | 通过 agent 权限模式和 callback 安全体系 | 完整 permission broker | 必做，优先参考第二个 |
| ask_user | 通过 bridge callback 机制可支持 | 明确 MCP 工具支持 | 强烈建议 |
| 多 provider | Claude/Codex | Claude/Codex | 必做 |
| Codex SDK | 偏 CLI/JSONL/app-server | 直接 SDK | 优先参考第二个 |
| profile | 完整 | 无 | 产品化必做 |
| daemon | 完整 | 无 | 产品化必做 |
| app 创建/扫码 | 有 PersonalAgent 向导 | 手动配置 app | 可选，先手动后向导 |
| 访问控制 | owner/admin/user/group | allowed_open_ids | 先简单，后升级 |
| 工作区切换 | `/cd`、`/ws` | `/cd`、`/project` | 必做 |
| 工作区安全 | 拒绝危险目录 | `/cd` 有确认，安全策略较弱 | 必做 denylist |
| session resume | session catalog + provider/cwd/policy | persisted session + project/provider | 必做 |
| crash recovery | 有 registry/locks/log | 有 clean shutdown 标记和通知 | 两者都借鉴 |
| callback 安全 | HMAC + nonce + TTL + context | requestId + owner 校验 | HMAC 模型更强 |
| 配置热更新 | 卡片配置 + profile | `/config set` | 两者结合 |
| 附件 | 图片/文件缓存，policy attachment | 图片支持较好，文件较弱 | 必做图片，文件后做 |

## 五、对 AutoAide 的推荐架构

建议分层：

```text
FeishuTransport
  - WebSocket events
  - card callbacks
  - message/card REST APIs
  - image/file download

MessageIntake
  - dedup
  - access control
  - mention policy
  - scope resolution
  - command routing
  - pending queue

RunCoordinator
  - per-scope active lock
  - global process/session pool
  - stop/interrupt
  - run lifecycle
  - crash recovery

SessionStore
  - scope/provider/workspace/policy fingerprint
  - Codex thread id
  - Claude session id if supported
  - usage/cost/context

ProviderAdapter
  - Codex SDK
  - Claude SDK/CLI
  - unified event stream

InteractionLayer
  - status card
  - tool activity card
  - permission card
  - ask_user card
  - final answer fallback

PolicyLayer
  - owner/admin/user/group
  - workspace safety
  - permission mode mapping
  - callback HMAC token
```

第一阶段 MVP：

1. 官方 Lark SDK WebSocket 接入。
2. 单 profile config。
3. allowed open_ids。
4. group require @bot。
5. per-chat session。
6. Codex SDK provider。
7. status card + final answer card。
8. `/new`、`/stop`、`/status`、`/cd`、`/provider`。
9. permission broker 基础版。

第二阶段产品化：

1. profile + daemon。
2. owner/admin/group allowlist。
3. HMAC callback token + nonce。
4. pending debounce queue。
5. workspace named aliases。
6. tool activity card。
7. ask_user MCP。
8. image/file attachments。

第三阶段差异化：

1. 文档评论 @bot。
2. lark-cli profile 隔离，让 agent 反向操作飞书文档、表格、日历。
3. 多 bot / 多 agent 路由。
4. process registry + runtime locks。
5. crash recovery 通知和日志 UI。

## 六、具体可直接借鉴的实现点

### 必须借鉴

- `lark-coding-agent-bridge` 的 scope 设计：p2p/group/topic/comment 必须分开。
- `lark-coding-agent-bridge` 的 PendingQueue：run active 时 block，结束后 flush。
- `lark-coding-agent-bridge` 的 callback HMAC + nonce。
- `lark-coding-agent-bridge` 的 workspace denylist。
- `agent-feishu-channel` 的 `FeishuPermissionBroker`。
- `agent-feishu-channel` 的 `FeishuQuestionBroker` + `ask_user` MCP。
- `agent-feishu-channel` 的 card streaming fallback：stream 失败转 patch，patch 失败只禁用该卡，不影响 final answer。
- `agent-feishu-channel` 的 `Codex SDK` adapter 思路。

### 可以延后

- PersonalAgent 扫码创建应用。
- 全平台 daemon。
- 文档评论。
- lark-cli 私有 profile。
- profile export/import。
- telemetry adapter。

### 不建议照搬

- `lark-coding-agent-bridge` 的 `src/commands/index.ts` 过大，AutoAide 应拆成 command modules。
- `agent-feishu-channel` 的 `src/index.ts` 和 `ClaudeSession` 都偏大，后续维护压力会高；借鉴逻辑，不照搬文件组织。
- `agent-feishu-channel` 的 access control 过轻，不适合团队群聊场景直接上线。
- 单纯依赖 requestId 的 card action 安全不足，团队环境建议使用 HMAC token。

## 七、风险与注意事项

1. 飞书卡片是产品体验核心，但也是故障点。必须有 text fallback。
2. 群聊里必须默认 require @bot，否则噪音、成本和误操作风险都很高。
3. 权限卡只允许触发用户点击，管理员代点要谨慎设计。
4. workspace 切换必须确认，且拒绝危险目录。
5. provider 差异不要泄漏到渲染层，统一 event stream 是关键。
6. callback value 不能信任，必须签名和防重放。
7. 附件下载到本地后，要限制大小、记录来源、做 GC。
8. 常驻进程必须有结构化日志和单实例锁。

## 八、最终建议

AutoAide 如果要从微信转向飞书，路线应该是：

- 底层接入选 `@larksuiteoapi/node-sdk`，先保证透明、可控、容易调试。
- 会话/产品架构参考 `lark-coding-agent-bridge`。
- Provider、permission broker、ask_user 和卡片 streaming 参考 `agent-feishu-channel`。
- 不要先做大而全。先完成“飞书群 @bot -> Codex SDK -> 权限卡 -> 流式状态 -> final answer”的闭环，再补 profile/daemon/文档评论。

最值得优先落地的 10 个功能：

1. Feishu WebSocket gateway。
2. Message translator：text/post/image。
3. Scope resolver：dm/group/topic。
4. Access control：owner + allowed users + allowed groups。
5. Pending queue：debounce + active-run block。
6. Codex SDK adapter。
7. Permission broker。
8. Status/tool/final cards。
9. Session store：scope + provider + workspace + thread id。
10. Workspace safety policy。
