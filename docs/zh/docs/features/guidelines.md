---
sidebar:
  group: 产品功能
  order: 66
---

# 项目准则

项目准则页面用于浏览当前项目的 guidelines（工程约定文档）。页面本身是只读的，guideline 的创建和更新由 Agent 在工作中通过 `fyllo-cortex` 的 `guidelines` 工具完成。

<figure class="fc-doc-image">
  <img src="/assets/screenshots/guidelines.png" alt="项目准则页面截图" />
</figure>

## guidelines 是什么

Guidelines 是项目自己的架构边界、命名约定、测试要求等工程约定，存放在仓库的 `guidelines/**/*.md` 下，随代码一起提交和版本化。它们不是 FylloCode 预置的规则，而是每个项目在使用过程中由 Agent 帮助沉淀出来的、这个项目特有的约定。

## Agent 辅助的演进闭环

Guidelines 的价值在于持续跟真实代码保持一致，这依赖一个由 Agent 驱动的小闭环：

- **Chat / Apply 开始时**：FylloCode 扫描当前工作区的 `guidelines/**/*.md`，把每个文件的 frontmatter 组成索引注入给 Agent，Agent 按需读取相关文档全文
- **创建 Proposal 前、Apply 或直接实现完成后**：要求 Agent 考虑这次改动是否需要新增或更新 guideline
- **Archive 前**：再次检查已完成的变更是否改变了命令、架构、测试方式、工作流或数据契约，如果是，归档前更新对应 guideline

这些检查点减少了人工定期整理 guidelines 的负担；只要 Agent 在变更中落实检查，项目约定就能随真实改动持续更新，降低长期失真的风险。

## 页面结构

左侧列出当前项目的全部 guideline 文件；右侧显示选中文档的说明和正文。文档如果缺少合法的 frontmatter，页面会用告警图标提示解析异常，此时 Agent 很难只通过索引判断是否需要打开该文档，建议尽快修复。

## 适用场景

当你想知道"这个项目对某个模块有什么约定"，或者想确认"Agent 上次改动之后有没有更新相关规范"，可以直接到这个页面查看。guideline 索引如何注入会话、维护模式的具体字段，见 [fyllo-cortex 参考](/docs/reference/fyllo-cortex)。
