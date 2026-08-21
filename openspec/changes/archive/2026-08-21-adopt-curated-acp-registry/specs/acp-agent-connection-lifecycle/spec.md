## MODIFIED Requirements

### Requirement: Main 在应用 ready 后预热全部全局已安装 ACP Agent

系统 SHALL 在 main 进程完成 shell PATH、required gate、IPC/event 注册和正式 renderer handoff 后，等待 renderer 首次 interactive signal 或 formal renderer load 后的有限 fallback，再后台发现并预热当前精选目录中具有全局 installed record 的 Registry Agent 与所有有效 custom Agent。仅存在于历史 installed record、但当前精选目录中没有相同 ID 的 Registry Agent SHALL NOT 进入预热队列。系统 SHALL NOT 等待这些连接 ready 后才完成 renderer critical bootstrap 或保持应用可交互。

#### Scenario: 应用冷启动发现多个当前目录内的全局 Agent

- **WHEN** required gate 和 runtime wiring 已完成且 renderer 首次报告 interactive
- **THEN** main SHALL 从当前精选 Registry、installed records 和 custom Agent 配置发现预热目标
- **AND** main SHALL 为每个目标提交连接预热
- **AND** main SHALL NOT 等待 Agent ready 才保持 Launcher/Workspace 可交互

#### Scenario: 历史安装已不在精选目录

- **WHEN** installed records 包含某个 Registry Agent，但当前精选目录没有相同 ID
- **THEN** main SHALL 忽略该记录且不提交连接预热
- **AND** main SHALL NOT 查询官方 Registry 恢复该 Agent

#### Scenario: Renderer interactive signal 丢失

- **WHEN** formal renderer 已完成 document load 但未在有限 fallback 窗口内报告 interactive
- **THEN** main SHALL 仍提交一次当前目录内的全局 installed/custom Agent warmup
- **AND** 后续迟到 signal SHALL 与已有 batch 幂等合并

#### Scenario: 应用启动时没有项目窗口

- **WHEN** 应用只有 Launcher window 且尚未打开任何项目
- **THEN** main SHALL 仍预热当前目录内的全局已安装 Agent 连接
- **AND** 连接预热 SHALL NOT 依赖 project ID、project path 或 renderer Agent store 状态

#### Scenario: 全局安装记录已经失效

- **WHEN** 当前目录内的 installed record 或 custom catalog 中的 Agent 无法由 process pool 启动
- **THEN** 系统 SHALL 将该 Agent 的预热记录为独立失败
- **AND** 系统 SHALL 继续预热其他 Agent
- **AND** main runtime、窗口与已可用 Agent SHALL 保持可用
