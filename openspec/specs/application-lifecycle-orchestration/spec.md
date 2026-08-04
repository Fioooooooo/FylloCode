# application-lifecycle-orchestration Specification

## Purpose

定义 FylloCode 从轻量可见启动反馈、required gate、正式 renderer readiness 到后台预热的启动编排，以及从窗口隐藏、quiesce、资源终止到最终退出的有界清理与阶段观测契约。

## Requirements

### Requirement: 应用在重型启动工作前显示轻量 startup shell

系统 SHALL 在取得单实例锁且 Electron `app` ready 后创建并显示唯一 startup shell，并在可见屏障结算后的下一轮 event loop 才执行重型 main runtime 加载、shell PATH、migration、业务 IPC、bundled MCP 与 ACP warmup。Startup shell SHALL 只提供应用级启动反馈，不得读取 Workspace/Folder/session 数据、调用业务 IPC、成为 Launcher/Workspace context 或绕过 required migration gate。

#### Scenario: 冷启动遇到慢 shell profile

- **WHEN** Electron `app` 已 ready 且 shell PATH 探测耗时较长
- **THEN** 系统 SHALL 在等待 shell PATH 结算前显示 startup shell
- **AND** 用户 SHALL 能看到持续的启动反馈而不是无窗口等待

#### Scenario: 冷启动需要执行 migration

- **WHEN** required migration 在本次启动需要执行或重试
- **THEN** startup shell SHALL 在 migration 执行期间保持可见
- **AND** 系统 SHALL NOT 在 gate 通过前暴露 Launcher、Workspace 数据或业务 IPC

#### Scenario: Startup shell 自身加载失败

- **WHEN** static startup page 无法完成加载
- **THEN** main SHALL 保持 required gate 与 normal runtime 隔离
- **AND** `did-fail-load` 或有界 startup page timeout SHALL 结算可见屏障而不得永久挂起启动
- **AND** 系统 SHALL 记录 startup page failure、继续使用 BrowserWindow `backgroundColor` 提供非透明反馈，并继续 required gate
- **AND** 失败或 timeout 后 SHALL NOT 重复执行 handoff

### Requirement: Startup shell 使用克制且可访问的 FylloCode 品牌 loading

Startup shell SHALL 使用生成的 renderer FylloCode Logo 资产与不确定环形进度视觉，不得复制品牌 SVG path或显示虚假百分比。动画 SHALL 只包含短高亮弧的稳定旋转与轻微 Logo 透明度波动，并 SHALL 支持浅色、深色和 reduced-motion。

#### Scenario: 默认 motion 设置

- **WHEN** 用户未启用 reduced motion
- **THEN** startup shell SHALL 在 FylloCode Logo 外显示低对比度环形轨道与匀速移动的短高亮弧
- **AND** Logo MAY 使用轻微、稳定的透明度波动
- **AND** 页面 SHALL NOT 显示百分比、虚构阶段或跳跃进度

#### Scenario: 用户启用 reduced motion

- **WHEN** `prefers-reduced-motion` 为 `reduce`
- **THEN** startup shell SHALL 停止环形旋转和 Logo 波动
- **AND** 页面 SHALL 保留静态 Logo、静态高亮弧与可访问的“正在启动 FylloCode…”状态

#### Scenario: 系统使用深色主题

- **WHEN** Electron native theme 与 renderer media query 表示深色主题
- **THEN** BrowserWindow background、startup page 与正式 renderer startup overlay SHALL 使用一致的深色 surface
- **AND** 页面切换 SHALL NOT 出现白色闪烁

### Requirement: Startup shell 与正式 renderer 复用同一窗口

Required gate 通过后，系统 SHALL 让 `WorkspaceWindowManager` 先保留既有 startup BrowserWindow的所有权但不授予业务 sender context，再导航到正式 renderer；只有预期 formal URL 的 main-frame navigation generation提交后才激活唯一 Launcher context。系统 SHALL NOT 为正常 handoff创建第二个可见窗口；startup与正式renderer之间 SHALL保持窗口位置、尺寸、焦点、唯一state writer和主题背景连续。

#### Scenario: Required gate 成功

- **WHEN** shell PATH、migration 和 cutover validation 已结算且 gate 通过
- **THEN** window manager SHALL reserve startup BrowserWindow且 SHALL NOT 立即注册 Launcher sender context
- **AND** 系统 SHALL 在同一 BrowserWindow 加载正式 renderer
- **AND** normal runtime SHALL 只在预期 formal main-frame generation提交后向该窗口提供业务 sender context

#### Scenario: Required gate 失败

- **WHEN** cutover validation 返回失败
- **THEN** 系统 SHALL 销毁或关闭 startup shell 后显示既有原生升级失败 UI
- **AND** startup window SHALL NOT 被接管为 Launcher
- **AND** 系统 SHALL NOT 注册业务 IPC、启动 bundled MCP 或提交 ACP warmup

#### Scenario: 正式 renderer 导航期间

- **WHEN** 同一 BrowserWindow 从 startup page 导航到正式 renderer
- **THEN** 窗口 SHALL 保持可见并使用一致 background
- **AND** 正式 renderer SHALL 在 critical bootstrap 结算前显示与 static shell 一致的全局 loading
- **AND** 页面 SHALL NOT 短暂显示 Welcome 或上一 Workspace 内容

#### Scenario: Startup window 在 gate 期间关闭

- **WHEN** startup window 在 required gate 或 handoff 前被用户关闭
- **THEN** StartupWindowController SHALL 取消该窗口 handoff并释放其 listeners
- **AND** 已开始的 protected migration MAY 安全结算但 SHALL NOT 导航已销毁窗口或进入 runtime handoff
- **AND** macOS 后续 activate/第二实例 SHALL 按 gate 状态创建 startup shell或正式 Launcher

### Requirement: Renderer bootstrap 区分 critical 与 background

Renderer SHALL 通过共享 bootstrap registry 显式标记 `critical` 与 `background` task。所有 critical task SHALL 并行或按其内部规定顺序结算后才移除全局 startup loading；background task SHALL 在 critical phase 结算后启动，且其失败或未完成 SHALL NOT 阻塞 Launcher/Workspace 内容交互。

#### Scenario: Workspace context 正在加载

- **WHEN** 正式 renderer 已 mount 但 Workspace critical bootstrap 尚未结算
- **THEN** App SHALL 显示全局 startup loading
- **AND** Router SHALL NOT 因初始 `currentWorkspace === null` 显示 Welcome 或执行错误导航

#### Scenario: Workspace critical bootstrap 失败

- **WHEN** Workspace context/list/current Workspace/session list 的既有 bootstrap 流程返回错误
- **THEN** critical phase SHALL 结算并移除全局 loading
- **AND** renderer SHALL 展示既有页面级 Workspace error state
- **AND** background task failure isolation SHALL 保持有效

#### Scenario: ACP renderer 初始化仍在运行

- **WHEN** Workspace critical bootstrap 已结算但 ACP registry、icon、status 或 capability cache 仍在加载
- **THEN** Launcher 或 Workspace 内容 SHALL 已可交互
- **AND** ACP 相关局部 UI SHALL 使用自己的 initializing 状态

### Requirement: Main 以 renderer interactive 信号调度后台预热

正式 renderer SHALL 在 critical bootstrap 结算并完成 DOM flush 后通过幂等的 application lifecycle channel 通知 main 已 interactive；critical失败但既有可操作错误页已呈现时也 SHALL 发送。Main SHALL 只接受已激活 formal renderer 当前 main-frame generation的signal，并以首次有效signal调度应用级ACP warmup；在signal丢失时使用从该generation的main-frame `did-finish-load` 起算的命名、可注入fallback timeout保证预热最终启动。startup/subframe load SHALL NOT启动该timer；timer SHALL在首次signal、shutdown、navigation、reload或window destroyed时取消。

#### Scenario: Renderer 正常完成 critical bootstrap

- **WHEN** renderer 发送首次 interactive signal
- **THEN** main SHALL 幂等提交全局 installed/custom Agent warmup
- **AND** main SHALL NOT 等待 warmup ready 才保持 renderer 可交互

#### Scenario: Renderer 未发送 interactive signal

- **WHEN** formal renderer 已完成 document load 但在 fallback 窗口内没有 interactive signal
- **THEN** main SHALL 仍提交一次全局 warmup
- **AND** 后续迟到 interactive signal SHALL NOT 重复创建 warmup batch或 Agent process

### Requirement: 启动和退出编排入口保持集中可发现

系统 SHALL 将 main startup phase、shutdown phase、task 名称和相对顺序集中声明在 `src/main/bootstrap/` 一层入口，并 SHALL 在同目录维护说明当前顺序、依赖规则和新增 task checklist 的文档。Main 深层 service/infra 模块 SHALL NOT 通过 import side effect 或隐式注册顺序触发 startup task或决定 global shutdown order。

#### Scenario: 新增 startup task

- **WHEN** 开发者检查或新增应用启动任务
- **THEN** 顶层 bootstrap orchestration SHALL 显示该任务所属 phase 和调用顺序
- **AND** 文档 SHALL 说明该任务是否允许进入 visible、gate、runtime、critical 或 background 路径

#### Scenario: 新增长生命周期资源

- **WHEN** 新 subsystem 需要在应用退出时清理
- **THEN** 浅层 shutdown orchestration SHALL 显式列出该资源的 named task 与 phase
- **AND** 深层模块 SHALL 只导出幂等 quiesce/dispose/force 方法
- **AND** import 顺序 SHALL NOT 改变清理顺序

### Requirement: 应用退出采用可见退出优先的分阶段有界清理

用户请求退出时，系统 SHALL 先设置 shutdown fence、在业务handler/stream/background入口拒绝新工作、显式捕获窗口状态并隐藏全部窗口，再依次执行 `quiesce`、`terminate` 与 `finalize` phase。同一 phase 中彼此独立的任务 SHALL 并行结算；除已开始的required migration protected mutation外，整个异步清理 SHALL共享单一总deadline，deadline内 SHALL执行OS-resource force/confirm hooks再调用`app.exit()`。protected migration必须先到达安全结算点，不能被deadline强杀或在结算后继续runtime handoff。

#### Scenario: 用户在正常运行时退出

- **WHEN** main 收到首次 `before-quit`
- **THEN** 系统 SHALL 阻止默认退出并拒绝新的受管工作
- **AND** 系统 SHALL 在等待 ACP/MCP 清理前保存并隐藏窗口
- **AND** quiesce SHALL 在 terminate 前完成

#### Scenario: 多个独立资源需要终止

- **WHEN** ACP process pool 与 bundled MCP host 均需要异步关闭
- **THEN** 系统 SHALL 在 terminate phase 并行请求两者关闭
- **AND** 系统 SHALL NOT 为每个资源重新获得完整的全局 deadline

#### Scenario: 资源清理超过总 deadline

- **WHEN** 任一 shutdown task 在总 deadline 内未结算
- **THEN** 系统 SHALL 记录未完成 task 名称
- **AND** 系统 SHALL 在同一总预算内为 force/confirm 预留固定尾部预算
- **AND** 系统 SHALL 对持有子进程或 listener 的资源执行 non-hanging force hook，以已登记 PID/process group 终止进程树并有界确认退出
- **AND** 系统 SHALL 结束应用且不得因 Promise 永久 pending 保持可见窗口

#### Scenario: 启动过程中退出

- **WHEN** startup shell 可见但 required gate、runtime import 或正式 renderer handoff 尚未完成时用户退出
- **THEN** shutdown fence SHALL abort后续 continuation
- **AND** 迟到的 migration/import/promise completion SHALL NOT 注册 IPC、导航窗口、启动 MCP 或提交 ACP warmup

#### Scenario: 退出发生在 required migration 写盘期间

- **WHEN** 用户请求退出且 required migration 已进入写盘区间
- **THEN** 系统 SHALL 立即隐藏窗口、设置 shutdown fence并记录 protected-mutation等待
- **AND** 系统 SHALL 等待 migration到达既有成功或失败安全结算点而不得由全局deadline强杀
- **AND** migration结算后 SHALL跳过runtime handoff并开始有界资源清理

#### Scenario: Shutdown fence 后收到业务请求

- **WHEN** 任意 Workspace、Proposal、Git、stream、ACP、MCP或workflow业务入口在shutdown fence后收到新工作
- **THEN** 浅层IPC/stream/background入口 SHALL拒绝启动该工作
- **AND** 系统 SHALL NOT依赖每个深层service自行发现shutdown状态

#### Scenario: Windows session end

- **WHEN** Windows 系统关机、重启或注销而无法等待正常异步 quit 流程
- **THEN** 系统 SHALL best-effort 设置 shutdown fence、撤销 grants、取消 timer 并终止已知子进程
- **AND** normal graceful deadline SHALL NOT 被声明为 session-end 的完成保证

### Requirement: Lifecycle performance 记录明确阶段而不记录敏感上下文

系统 SHALL 使用 monotonic clock 记录 process entry、app ready、startup visible、required gate、runtime ready、renderer interactive、shutdown requested、windows hidden、各 shutdown phase 与 shutdown complete 的 duration/result。记录 SHALL 只包含预定义 phase、duration、结果和运行模式，不得包含 Workspace path、Agent command、argv、token 或用户数据。

#### Scenario: 正常启动完成

- **WHEN** renderer 首次达到 interactive
- **THEN** main SHALL 记录从 process entry 到 startup visible、runtime ready 和 renderer interactive 的分段耗时
- **AND** 日志 SHALL 能区分 shell PATH、migration 与 renderer critical bootstrap

#### Scenario: Shutdown deadline 触发

- **WHEN** 退出清理达到总 deadline
- **THEN** main SHALL 记录已完成和未完成 phase/task及 visual-exit duration
- **AND** 日志 SHALL NOT 输出被终止进程的敏感命令行或环境变量
