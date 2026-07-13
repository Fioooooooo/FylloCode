# Chat Prompt Timeline

状态：未来重组方向，仅作边界留存；可作为较低风险的 feature 迁移试点。

## 目标

把历史用户 prompt 投影、timeline 导航状态和对应 UI 收拢为独立浏览能力，用于验证 feature public entry、测试镜像和 lint 边界。

## 当前来源

- `src/renderer/src/components/chat/timeline/**`
- `src/renderer/src/composables/usePromptTimeline.ts`
- `src/renderer/src/utils/chat-prompt-timeline.ts`

## 预期边界

- `model`：`Session/UIMessage -> ChatPromptTimelineItem[]` 的纯投影。
- `application`：active item、滚动同步、导航 intent 和 teardown。
- `ui`：ChatPromptTimeline、ChatPromptTimelineNav。
- `integration`：与 ChatContainer 消息滚动容器的连接。

## 保持在 feature 外

- session/chat stores
- 通用 message part 和 system-reminder parser
- Chat Composer 的草稿与提交状态

迁移应保持当前 timeline 顺序、隐藏 system reminder、附件摘要和滚动定位行为不变。
