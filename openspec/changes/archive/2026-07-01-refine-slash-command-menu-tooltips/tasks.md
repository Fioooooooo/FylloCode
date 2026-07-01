## 1. CommandPalette 数据与列表渲染

- [x] 1.1 修改 `src/renderer/src/components/chat/prompt/SlashCommandMenu.vue` 的 `CommandMenuItem` 结构：不再把 `command.description` 写入 `UCommandPalette` item 的标准 `description` 字段，保留原始 `command: AcpAvailableCommand` 作为详情与搜索来源。
- [x] 1.2 更新 `commandMenuGroups` 映射，列表项只提供 `label`、`suffix`、`command` 等必要字段；确保 `UCommandPalette` item 内不会渲染 description/hint 文案，也不会留下空 description 行高度。
- [x] 1.3 更新 `commandPaletteFuse`，继续显式配置 `resultLimit: props.commands.length`、`shouldSort: false`、`matchAllWhenSearchEmpty: true`，并将搜索 keys 覆盖 `label`、`command.description`、`command.hint`。
- [x] 1.4 保留 `:preserve-group-order="true"`，确保初始空搜索和搜索结果都不打乱 `availableCommands` 的相对顺序。

## 2. Tooltip 高亮同步

- [x] 2.1 在 `SlashCommandMenu.vue` 中新增高亮状态，例如 `highlightedCommand` 与 `highlightedReference`，并实现 `handleCommandHighlight(payload)`；payload 为 `undefined` 或不是有效 command item 时清空状态。
- [x] 2.2 监听 `UCommandPalette` 的 `@highlight` 事件，让鼠标 hover 与键盘上下键移动共用同一个高亮 command 与 DOM reference。
- [x] 2.3 使用受控 `UTooltip` 渲染右侧详情，`reference` 指向 `highlightedReference`，open 条件为当前高亮 command 至少存在一个非空 `description` 或 `hint`。
- [x] 2.4 tooltip 内容按字段可用性渲染：description 在上，hint 在下；字段为 `undefined`、空串或仅空白字符时不展示；两者都为空时不打开 tooltip。
- [x] 2.5 在菜单关闭、commands 变为空、或选中 command 后清空 tooltip 状态，避免 tooltip 引用已卸载的列表项 DOM。

## 3. 触发、插入与搜索语义保持

- [x] 3.1 保持 `/` 触发路径的当前语义：keydown 只记录待打开状态，input 后打开菜单，palette 初始搜索词为空，不把触发用 `/` 带入搜索。
- [x] 3.2 保持按钮触发路径、回车选择、ESC 关闭、鼠标点击选择、焦点回到输入框、命令插入和 hint placeholder 行为不变。
- [x] 3.3 确认搜索仍能匹配命令 label、description、hint，且不会重新引入默认 12 条截断或 Fuse 排序重排。

## 4. 测试

- [x] 4.1 更新 `test/renderer/src/components/slash-command-menu.spec.ts` 的 `UCommandPalette`/`UTooltip` stub，使测试能观察 item 文案、fuse 配置、preserve group order、highlight 事件和 tooltip 内容。
- [x] 4.2 覆盖列表仅渲染 `/<command.name>`：description/hint 不出现在列表项内，且不会产生空 description 容器。
- [x] 4.3 覆盖 tooltip 字段组合：仅 description、仅 hint、两者都有、两者都没有；无详情 command 不展示空 tooltip。
- [x] 4.4 覆盖 hover/highlight payload 更新 tooltip reference 与内容，验证键盘高亮路径与鼠标 hover 路径使用同一套状态。
- [x] 4.5 保留或补充命令数量、原始顺序、搜索不排序、slash 触发 searchTerm 为空、命令插入语义的现有测试；测试不得断言固定 command 数量。

## 5. 文档与验证

- [x] 5.1 评估是否需要更新 `guidelines/UiDesign.md`：若本实现形成可复用的「列表主信息 + 高亮 tooltip 详情」模式，则补充简短规则；若只是本组件局部模式，则无需更新 guideline。
- [x] 5.2 运行 `pnpm vitest run test/renderer/src/components/slash-command-menu.spec.ts test/renderer/src/components/chat-prompt-panel.spec.ts`。
- [x] 5.3 运行 `pnpm typecheck:web`。
