## 1. 能力协商接线

- [x] 1.1 扩展 `electron/main/infra/process/acp-process-pool.ts`，让每个 live process entry 都缓存 ACP `initialize` 协商出的 initializeResponse。
- [x] 1.2 通过现有 process-pool 返回结构把 capability 暴露给 `AcpSession` 使用，不额外引入新的跨模块抽象层。
- [x] 1.3 为进程池 capability 缓存与 agent 重启后的替换行为补充定向测试。

## 2. 恢复状态机

- [x] 2.1 重构 `electron/main/services/chat/acp-session.ts`，把持久化 `acpSessionId` 的主路径改成 direct-prompt-first，而不是 resume-first。
- [x] 2.2 实现集中式 missing-session 分类器，优先识别结构化 ACP 错误，其次回退到一个小型已知 adapter 签名白名单。
- [x] 2.3 跟踪当前 turn 是否已经收到任何 `session/update`，并以“尚未看到任何 update”为自动恢复前置条件。
- [x] 2.4 在 `AcpSession.start()` 中实现 capability-driven 的恢复顺序：支持时先 `resumeSession`，再 `loadSession`，最后 fresh `newSession` 兜底，且每个阶段单 turn 内只尝试一次。
- [x] 2.5 保持 reminder 注入规则不变：只有真正的新 ACP session 路径才注入，包括所有 ACP-native 恢复失败后的 fresh-session fallback。

## 3. 历史 replay 与兜底上下文重建

- [x] 3.1 为 `AcpSession` 增加按 owner 判断本地历史是否已存在的最小输入或 helper，覆盖 chat / apply / archive 三类 session。
- [x] 3.2 实现 `loadSession` 的临时 replay-suppression 阶段：抑制 replay 消息再次进入 UI 组装与磁盘落盘，但保留 session 级元数据更新。
- [x] 3.3 为 fresh-session fallback 增加 best-effort 本地历史重建路径：在当前用户输入前连续注入两条 `system-reminder`，其中第二条为包裹 `<system-reminder>` 的本地历史转录。
- [x] 3.4 明确 fresh-session fallback 下两条 `system-reminder` 的持久化行为，并复用前端现有的 system-reminder 隐藏规则，避免对用户展示伪重建上下文。
- [x] 3.5 更新 chat 与 proposal-apply 的 IPC / session 接线，只传入重构后 `AcpSession` 所需的最小恢复与历史判断输入。

## 4. 验证

- [x] 4.1 补充单元测试，覆盖 direct prompt 成功、missing-session prompt 失败分类、capability-driven 的 `resume` / `load` 选择，以及“出现任意 update 后不得自动恢复”的保护条件。
- [x] 4.2 补充 `loadSession` replay 抑制测试，覆盖“本地已有历史时不重复进 UI / 写盘”以及“抑制阶段内元数据仍正常透传”。
- [x] 4.3 补充 fresh-session fallback 测试，覆盖双 `system-reminder` 注入顺序、历史转录格式、以及新 `acpSessionId` 的立即持久化替换。
- [x] 4.4 补充 reminder 持久化与前端隐藏边界测试，确认伪重建上下文不会作为用户可见消息展示。
- [x] 4.5 对本次变更涉及的 OpenSpec artifact 与 chat / proposal ACP 相关测试套件执行定向校验。
