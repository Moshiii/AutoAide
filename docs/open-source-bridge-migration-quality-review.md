# CodexBridge Migration Plan Quality Review

本文从工程评审角度审查 `open-source-bridge-migration-plan.md`，重点回答三个问题：

- 这份迁移计划是否完备。
- 如何制定稳定的开发和测试计划。
- 如何保障已有功能不丢，新功能能稳定接入。

结论先说：现有迁移计划方向正确，但还不够“工程化”。它已经回答了“学什么、怎么拆模块、分几期做”，但还需要补齐发布闸门、兼容契约、测试分层、数据迁移策略、观测指标、回滚机制和负责人检查清单。否则重构本身可能是对的，但执行中仍然容易破坏 Feishu/Telegram/Web/计费/run ledger 这些已有能力。

## 1. 总体评审

### 1.1 计划已经做对的部分

现有计划有几个重要判断是正确的：

- 不是重写，而是旁路新增、逐步切流。
- 先抽 `AgentEvent + RunExecutor + FeishuGateway`，而不是先做卡片 UI。
- 保留 CodexBridge 自己的产品资产：多 bot、workspace、web control plane、users/credits/billing、runs ledger、goals/schedules。
- 用 feature flag 控制新旧路径。
- 明确应用层 policy 不是硬沙箱。
- 每个阶段都要求 `npm test` 通过。

这些判断能避免最危险的“看了竞品后把自己项目推倒重来”。

### 1.2 计划目前不够完备的地方

缺口主要在工程稳定性，不在架构想法。

| 缺口 | 风险 | 应该补的机制 |
| --- | --- | --- |
| 缺少兼容契约 | 新模块输出和旧模块不一致，用户行为变了但没人发现 | Contract tests + golden fixtures |
| 缺少发布闸门 | alpha 功能可能过早默认打开 | 每期 entry/exit criteria |
| 缺少真实回归矩阵 | `npm test` 通过但 Feishu/Telegram 端到端坏了 | Smoke test checklist |
| 缺少数据迁移策略 | run/session/router 状态字段变更后历史数据读不出来 | Additive schema + migration test |
| 缺少观测指标 | 新 runtime 出问题后不知道错在哪 | structured logs + event audit |
| 缺少回滚剧本 | flag 关闭后仍有新数据或新状态污染旧路径 | rollback checklist |
| 缺少安全测试 | PermissionBroker 看起来安全，但 callback/action 可能被伪造 | security tests |
| 缺少跨 channel 不变式 | Feishu 修好，Telegram/Web 被破坏 | channel behavior parity tests |

因此建议把迁移计划升级成“每一阶段都有契约、测试、发布闸门、回滚剧本”的工程计划。

## 2. 稳定开发总原则

### 2.1 永远先定义不变式

每个新模块开工前，先写它不能破坏什么。

CodexBridge 当前必须保持的不变式：

- `BOT_HOME` 隔离不破。
- 用户、积分、计费账本不丢。
- run 状态必须单调流转：`queued -> running -> completed/failed/stopped/denied`。
- failed paid run 必须退款，daily free 不退 paid credits。
- Telegram 私聊/群聊权限不变。
- Feishu 文本回复不变。
- Web control plane 能列 users、credits、usage、runs。
- workspace 默认路径仍然是 bot home 下的 workspace。
- CLI 主会话 `main` 不丢。
- 老配置文件能被新版本读取。

每一个迁移 PR 都要说明它触碰了哪些不变式，并给出测试证明。

### 2.2 先加测试，再抽模块

对旧行为没有测试的地方，不应该直接重构。先把旧行为用 fixture/golden test 固定下来，再抽新模块。

尤其是：

- Feishu event -> envelope。
- Feishu command -> response。
- sessionKey 生成。
- busy 行为。
- stop 行为。
- failed billing settle。
- Codex CLI event parse。

### 2.3 默认关闭，逐步打开

所有新路径都先 behind flag：

- 本地开发打开。
- 单 bot canary 打开。
- owner only 打开。
- 小群打开。
- 默认打开。

不要在同一个版本里同时“引入新模块”和“默认切流”。

### 2.4 数据只做增量扩展

迁移期只能加字段，不要改字段含义，不要删除字段。

安全顺序：

```text
v1 reads old
v2 reads old + writes old/new
v3 reads old/new + writes old/new
v4 reads old/new + writes new
v5 remove old support
```

CodexBridge 现在还没到 v5，至少几个 alpha 内都应维持 old/new 双读。

## 3. 测试金字塔

建议建立 6 层测试，不要只靠当前 `npm test`。

### 3.1 Unit tests

覆盖纯函数和小模块。

必须包括：

- `AgentEvent` normalizer。
- `MessageTranslator`。
- `ScopeResolver`。
- `CommandRouter`。
- `RunPolicy`。
- `CallbackAuth`。
- `PendingQueue`。
- `CardRenderer`。

要求：

- 无网络。
- 无真实 Feishu/Telegram。
- 无真实 Codex CLI。
- 快速、稳定、默认每次提交都跑。

### 3.2 Contract tests

这是当前计划最需要补的层。

Contract test 用来保证新模块和旧模块行为一致。

例子：

```text
旧 normalizeFeishuEnvelope(input) == 新 messageTranslator.toEnvelope(input)
旧 resolveConversationIdentity(envelope) == 新 scopeResolver.resolve(envelope)
旧 Feishu /help 输出 == 新 commandRouter(/help) 输出
旧 busy 文案 == 新 runtime busy fallback 文案
```

Contract tests 应该贯穿迁移期。等旧模块删除时，这些 contract test 变成新模块自己的 golden test。

### 3.3 Fixture tests

用真实样例固定平台输入输出。

建议新增：

```text
test/fixtures/feishu/text-message-private.json
test/fixtures/feishu/text-message-group-mention.json
test/fixtures/feishu/text-message-group-no-mention.json
test/fixtures/feishu/unsupported-file-message.json
test/fixtures/feishu/card-action-allow.json
test/fixtures/feishu/card-action-deny.json
test/fixtures/telegram/private-message.json
test/fixtures/telegram/group-mention.json
test/fixtures/codex/thread-started.ndjson
test/fixtures/codex/tool-call.ndjson
test/fixtures/codex/command-exec.ndjson
test/fixtures/codex/final-message.ndjson
```

要求：

- fixture 里不要放真实 token/open_id。
- 所有 ID 都假数据。
- 每个 fixture 有预期 envelope/event snapshot。

### 3.4 Integration tests

用 mock gateway + mock agent adapter 跑完整流程。

必须覆盖：

- Feishu private text -> run completed -> reply sent。
- Feishu group mention -> run completed。
- Feishu group no mention -> ignored。
- Duplicate message -> no duplicate run。
- Busy session -> old mode denied / queue mode pending。
- Stop running -> run stopped。
- Agent failure -> failed run + billing refund。
- Permission requested -> callback allow -> run continues。
- Permission requested -> callback deny -> run stops。

这些不需要真实 Feishu，也不需要真实 Codex。

### 3.5 Smoke tests

每个 alpha 发版前手动跑，时间控制在 15 分钟内。

清单：

- CLI：启动、提问、resume。
- Web：打开 control plane、看 users/runs/credits。
- Telegram：私聊 `/help`、普通问题、群 mention、`/stop`。
- Feishu：私聊 `/help`、普通问题、群 mention、unsupported payload。
- Billing：group daily free、private paid、failed refund。
- Workspace：能读默认 workspace context，不能越过 workspace-files 的路径限制。

Smoke test 需要记录结果，不要只口头说“试过了”。

### 3.6 Canary tests

新功能默认关闭后，选一个测试 bot 打开。

Canary bot 要满足：

- 独立 `BOT_HOME`。
- 独立 Feishu/Telegram 配置。
- 不使用主账号/主群。
- 测试数据可删。

Canary 通过后再考虑默认启用。

## 4. 发布闸门

每个 phase 必须有 entry criteria 和 exit criteria。

### 4.1 Entry Criteria

开工前必须满足：

- 明确本 phase 触碰哪些不变式。
- 明确 feature flag 名称。
- 明确新增/修改哪些模块。
- 明确旧路径如何保留。
- 明确测试清单。
- 明确回滚方式。

如果说不清这些，不开工。

### 4.2 Exit Criteria

合并前必须满足：

- `npm test` 通过。
- 新模块 unit tests 通过。
- 相关 contract tests 通过。
- 相关 fixture tests 通过。
- 文档更新。
- feature flag 默认值符合计划。
- 旧路径仍能运行。
- `git diff` 没有无关重构。

### 4.3 Default-on Criteria

从 flag 默认关闭改成默认开启前，必须满足：

- 至少一个 alpha 版本中手动打开跑通过。
- Canary bot 跑过 smoke。
- 没有 P0/P1 bug。
- 有清楚的 rollback flag。
- run ledger/billing 没有异常。
- 用户可见文案和操作路径稳定。

## 5. 阶段级质量计划

### Phase 1: AgentEvent

风险：

- Codex CLI JSON 解析和旧 `onStatus` 行为不一致。

必须测试：

- raw Codex event -> AgentEvent。
- unknown raw event 不崩溃。
- old `onStatus` callback 仍被调用。
- final text 提取不变。

发布闸门：

- 不接入 Feishu/Telegram。
- 只加 `onAgentEvent` 可选回调。
- 默认不开启下游消费。

回滚：

- 不传 `onAgentEvent` 即回到旧行为。

### Phase 2: RunExecutor

风险：

- billing、run state、conversation log 时序改变。

必须测试：

- completed。
- failed + refund。
- stopped。
- denied。
- daily free 不退 paid credits。
- paid private 失败退款。
- run outputPreview 裁剪不变。

发布闸门：

- Feishu 旧路径和新 executor 路径 golden 对比。
- flag 默认关闭。

回滚：

- `CODEXBRIDGE_RUN_EXECUTOR=0` 后旧 Feishu 逻辑继续工作。

### Phase 3: ChannelRuntime / ScopeResolver

风险：

- sessionKey 变化导致旧会话断裂。

必须测试：

- private sessionKey 与旧逻辑一致。
- group sessionKey 与旧逻辑一致。
- Feishu 和 Telegram envelope 都能解析。
- `/help`, `/credits`, `/where`, `/stop` 不误进入 agent。

发布闸门：

- Contract test 对旧 `resolveConversationIdentity`。
- 不改存储字段含义。

回滚：

- 旧 `session-routing.mjs` 保留。

### Phase 4: FeishuGateway

风险：

- Feishu SDK 调用参数错。
- webhook event translator 漏字段。

必须测试：

- private text fixture。
- group mention fixture。
- no mention ignored。
- duplicate message dedupe。
- unsupported payload response。
- send text 参数 snapshot。

发布闸门：

- gateway behind flag。
- 旧插件入口不删。
- 卡片功能不同时引入。

回滚：

- 关闭 gateway flag，回到旧插件路径。

### Phase 5: CardRenderer

风险：

- 飞书卡片限流、卡片失败导致 run 失败。

必须测试：

- queued/running/tool/final/failed/stopped 卡片 snapshot。
- 长文本截断。
- update card 失败 fallback text。
- update 节流。

发布闸门：

- 文本 reply fallback 必须存在。
- 卡片 flag 默认关闭。

回滚：

- 关闭 card flag，继续文本回复。

### Phase 6: PendingQueue

风险：

- queued 任务扣费时机错误。
- 用户看不懂任务是否在排队。

必须测试：

- pending 不扣费。
- 从 pending 转 running 前才扣费。
- queue full 拒绝。
- cancel pending。
- stop running 后 pending 策略明确。

发布闸门：

- queue flag 默认关闭。
- old busy 行为可恢复。

回滚：

- 关闭 queue flag，回到 busy reject。

### Phase 7: PermissionBroker

风险：

- 授权动作和实际执行动作不一致。
- callback 被伪造或重放。

必须测试：

- allow once。
- deny。
- timeout。
- action hash mismatch。
- nonce replay。
- unauthorized user。

发布闸门：

- 不先接管所有 shell。
- 先只保护 bridge 层动作。

回滚：

- 关闭 broker flag，不暴露需要 broker 的动作。

### Phase 8: WorkspacePolicy / RunPolicy

风险：

- 用户以为这是硬沙箱，但实际只是应用层限制。
- 子进程 env/cwd 泄露。

必须测试：

- cwd 限制。
- env allowlist。
- deny parent path。
- group 默认更严格。
- owner/admin 策略不同。

发布闸门：

- 文档明确安全边界。
- 对外使用前必须有独立系统用户/container 方案。

回滚：

- owner policy 可恢复旧行为。
- 普通用户策略不要自动放宽。

## 6. 回归测试矩阵

每次触碰 runtime/channel/billing/session，都要跑这张矩阵。

| 功能面 | 必测用例 | 自动化优先级 |
| --- | --- | --- |
| CLI | start、prompt、resume | 中 |
| Web control plane | list bots、runs、users、credits、quick test | 高 |
| Telegram private | `/help`、普通问题、`/credits` | 高 |
| Telegram group | mention、no mention、access gate | 高 |
| Feishu private | `/help`、普通问题、unsupported payload | 高 |
| Feishu group | mention、no mention、dedupe | 高 |
| Billing | daily free、paid private、failed refund | 最高 |
| Runs | queued/running/completed/failed/stopped/denied | 最高 |
| Session | private/group sessionKey、resume ref | 最高 |
| Workspace | context prompt、workspace-files path guard | 高 |
| Security | callback auth、nonce、policy deny | 高 |

## 7. 开发流程建议

### 7.1 PR 粒度

每个 PR 只做一种事情：

- PR 1：加 fixture，不改实现。
- PR 2：加 AgentEvent normalizer，不接入业务。
- PR 3：`codex-runner` 输出 optional AgentEvent。
- PR 4：RunExecutor mock 测试。
- PR 5：Feishu behind flag 接 RunExecutor。

不要一个 PR 同时做：

- 抽模块。
- 改数据格式。
- 改用户文案。
- 改 Feishu/Telegram/Web 三端。
- 默认打开新功能。

### 7.2 Branch 策略

建议：

```text
main
  codex/migration-agent-events
  codex/migration-run-executor
  codex/migration-feishu-gateway
```

每个 branch 完成一小块，合并前跑完整测试。

### 7.3 Commit 策略

每个 commit 应该能说明：

- 增加了什么模块。
- 是否改了旧行为。
- 对应测试是什么。

推荐格式：

```text
runtime: add agent event normalizer
runtime: add run executor behind feature flag
feishu: add message translator fixtures
security: add callback nonce validation
```

### 7.4 Feature Flag 策略

feature flag 不只是 env 变量，还要有状态报告。

Control plane readiness 里应该显示：

- Agent events: off/on
- Run executor: off/on
- Feishu gateway: off/on
- Feishu cards: off/on
- Pending queue: off/on
- Permission broker: off/on
- Workspace policy: off/on

这样线上调试时不用猜。

## 8. 观测和审计

新 runtime 必须补 structured logs。

关键事件：

- run created。
- run started。
- run completed/failed/stopped。
- billing charged/refunded/denied。
- permission requested/allowed/denied/timeout。
- queue enqueued/dequeued/cancelled。
- callback rejected。
- policy denied。

日志字段：

```js
{
  event,
  runId,
  sessionKey,
  channel,
  userId,
  chatId,
  botHome,
  featureFlags,
  durationMs,
  errorCode
}
```

注意：

- 不记录 prompt 全文。
- 不记录 secret/token。
- path 可以记录相对 workspace path，不要默认记录宿主机敏感路径。

## 9. 数据兼容和迁移

### 9.1 Runs

短期只追加字段：

```json
{
  "agentProvider": "codex-cli",
  "events": [],
  "channel": "feishu",
  "policy": {
    "workspacePolicyId": null,
    "runPolicyId": null
  }
}
```

不要改：

- `status`
- `runId`
- `userId`
- `outputPreview`
- `reason`
- `error`

### 9.2 Sessions

迁移期同时保存：

```json
{
  "sessionKey": "old-compatible-key",
  "scope": {
    "channel": "feishu",
    "chatType": "group",
    "chatId": "...",
    "userId": "..."
  },
  "cliSessionRef": "..."
}
```

新 scope 不能替代旧 sessionKey，直到有迁移测试证明历史会话可读。

### 9.3 Router state

Feishu router state 里已有 `processedMessageIds`。迁移时必须保留 dedupe 语义。

建议把 dedupe 抽成 shared helper，但先保持文件结构不变。

## 10. 安全保障计划

如果未来真的要让别人用你的主机跑 Codex，必须分三层。

### 10.1 应用层

CodexBridge 负责：

- 用户身份。
- 群/私聊权限。
- 计费。
- workspace policy。
- run policy。
- permission broker。
- callback security。

这层能防普通误操作和产品越权，但不是硬隔离。

### 10.2 进程层

Codex 子进程必须：

- 使用最小 env allowlist。
- cwd 固定到 workspace。
- 不继承主机敏感变量。
- 有超时。
- 有输出大小限制。
- 可停止。

### 10.3 系统层

对外开放前必须至少做到一种：

- 独立系统用户。
- container。
- microVM。
- macOS sandbox profile。
- 远程隔离 worker。

否则不能承诺“只能操作某个文件夹，其他看不了”。应用层做不到这个承诺。

## 11. 稳定接入新功能的标准模板

以后每个新功能都按这个模板写开发计划：

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

例子：

```text
Feature: Feishu Card Renderer
Flag: CODEXBRIDGE_FEISHU_CARDS
Touched invariants: Feishu final reply, run status, failed output
Old path: send text reply
Data changes: none
Rollback: disable flag, fallback to text reply
Default-on criteria: canary bot 3 days no failed card update causing run failure
```

## 12. 对现有计划的修改建议

建议在 `open-source-bridge-migration-plan.md` 里补 5 个硬章节：

1. Compatibility Contract
2. Test Strategy
3. Release Gates
4. Rollback Playbook
5. Observability and Security Gates

否则它更像架构计划，不够像工程执行计划。

## 13. 第一阶段推荐执行顺序

更稳的第一阶段不是直接写 `RunExecutor`，而是：

1. 固化旧行为 fixture。
2. 加 contract tests。
3. 抽 `AgentEvent`。
4. 接入 optional `onAgentEvent`。
5. 加 mock `RunExecutor`。
6. 在 Feishu behind flag 接入。
7. Canary bot 手动验证。

这样即使新模块写错，也能明确知道错在哪里。

## 14. 专家评审结论

现有迁移计划架构方向是对的，但如果按原计划直接开干，最大风险是“模块拆出来了，但旧行为被悄悄改变”。要把它变成稳定工程计划，必须把每个阶段绑定：

- 不变式。
- contract tests。
- fixture tests。
- feature flag。
- release gate。
- rollback。
- observability。

最重要的一条：先写保护旧行为的测试，再抽模块。CodexBridge 现在已经有 200 个测试，这是很好的基础，但迁移期还需要补 Feishu fixture、runtime contract、billing/run state golden、callback security 这几类测试。做到这些，才适合一小块一小块地把两个开源项目的优点吸收进来，而不是在重构中丢掉已有能力。
