## MODIFIED Requirements

### Requirement: prompt_to_agent 支持新建、续聊与 config override

`prompt_to_agent` SHALL在省略spawned sessionId时创建新Session，在提供owner-matched spawned sessionId时继续当前进程世代仍active的ACP Session。新Session SHALL以`newSession().configOptions`作为首次config schema和snapshot的主要来源；resume/load SHALL使用现有config recovery收敛持久化值与activation live options。

`prompt_to_agent` SHALL接受可选string字段`model`与`thought_level`。`model` SHALL只针对live snapshot中唯一的`type=select && category=model` option解析，`thought_level` SHALL只针对唯一的`type=select && category=thought_level` option解析；两者的输入 SHALL表示目标value或查询词而不是option ID。Main SHALL在同一次tool调用内先激活真实ACP Session，再解析和设置语义配置，最后才发送prompt，调用方 SHALL NOT需要先创建探测turn取得option ID。

语义value解析 SHALL依次执行raw value精确匹配、归一化value精确匹配、归一化name精确匹配和保守token包含匹配；每一层一旦产生候选 SHALL不再进入更宽松层。只有候选数量恰好为一时 SHALL设置该value；零候选或两个及以上候选 SHALL返回`configuration_required`及当前支持的options，并 SHALL NOT发送prompt。系统 SHALL NOT按候选顺序、默认provider、currentValue、Agent identity或相似度评分自动决胜。

Main SHALL先应用model，并以每次`session/set_config_option`响应中的完整`configOptions`替换live snapshot，再解析`model_config`、`thought_level`及其他请求。出现语义字段时，语义请求与raw `config` SHALL作为同一desired state逐步收敛；同一option的同值请求 SHALL去重，raw精确值可在属于语义查询候选时提供精确消歧，冲突值 SHALL返回`SPAWN_INVALID_REQUEST`且不得静默覆盖。系统 SHALL对重复snapshot或有限迭代内无法收敛的配置中止prompt。

现有`config` SHALL继续只接受option ID到string/boolean value的映射，并 SHALL在每次prompt前按option id、类型与候选值验证和逐项设置，包含仍active ACP Session的warm direct prompt路径。未提交`model`与`thought_level`的raw-only调用 SHALL保持既有应用顺序与set失败warning-and-continue行为。包含语义字段的调用若语义option缺失/重复、value无法唯一解析、语义set失败、response缺少完整snapshot、输入冲突或配置无法收敛，SHALL不发送prompt。首次accepted、`configuration_required`或同步terminal snapshot SHALL不依赖异步`config_option_update`到达。

#### Scenario: 同步首次prompt返回config

- **WHEN**`newSession`返回model与thought level config options且同步prompt成功
- **THEN**tool结果 SHALL包含spawned sessionId、完成响应和精简config snapshot
- **AND** SHALL NOT等待异步config update才发送prompt

#### Scenario: 后台首次prompt返回config

- **WHEN**`newSession`返回完整config options且后台prompt已经提交
- **THEN**accepted结果 SHALL包含基于该返回值并应用本轮override后的config snapshot
- **AND**后续异步config update SHALL NOT改变已经返回的accepted snapshot

#### Scenario: 首轮指定raw config

- **WHEN**调用方在新Session请求中只提交`config: { model: "o3" }`且`model`是live option ID、该值属于其候选
- **THEN**Main SHALL在发送prompt前调用现有set-config-option RPC
- **AND**accepted或完成结果 SHALL反映成功应用后的current value
- **AND**既有raw-only设置失败warning-and-continue语义 SHALL保持不变

#### Scenario: 首轮指定精确语义model与thought level

- **WHEN**调用方在新Session请求中提交`model`与`thought_level`，且两者分别在对应category option中唯一匹配
- **THEN**Main SHALL从live snapshot取得各自真实option ID，先设置model，再用完整新snapshot设置thought level
- **AND** SHALL在同一次`prompt_to_agent`调用中完成设置并发送正式prompt

#### Scenario: 模型切换重塑thought level

- **WHEN**设置model后Agent返回的完整snapshot改变了`category=thought_level` option ID或候选值
- **THEN**Main SHALL只使用该新snapshot重新解析并设置`thought_level`
- **AND** SHALL NOT使用`newSession`初始snapshot中的旧option ID或候选

#### Scenario: 语义model产生多个模糊候选

- **WHEN**`model=luna`在live model option中匹配两个或以上provider-qualified values
- **THEN**tool SHALL返回`configuration_required`、`promptDispatched=false`和按Agent原顺序排列的匹配候选
- **AND**系统 SHALL NOT选择current/default provider、首项或最高相似度候选
- **AND** SHALL NOT持久化正式user message或turn、发送prompt或创建notification

#### Scenario: 语义配置没有候选

- **WHEN**`model`或`thought_level`在对应live option中没有任何候选，或对应category option缺失/重复
- **THEN**tool SHALL返回`configuration_required`及可用schema/options
- **AND** SHALL NOT在Agent默认配置下发送prompt

#### Scenario: raw config与语义字段重复或冲突

- **WHEN**raw `config`与`model`或`thought_level`最终解析到同一option ID
- **THEN**相同目标值 SHALL去重，raw精确值属于语义候选时 SHALL作为精确消歧
- **AND**不同且不兼容的目标值 SHALL返回`SPAWN_INVALID_REQUEST`
- **AND**系统 SHALL NOT依赖JSON object顺序或last-write-wins静默选择

#### Scenario: warm续聊指定config

- **WHEN**调用方续聊仍active的spawned ACP Session并提交合法raw或语义config override
- **THEN**Main SHALL在direct prompt前使用当前live snapshot验证和应用该override
- **AND** SHALL NOT因跳过cold recovery而静默忽略override

#### Scenario: raw config设置失败

- **WHEN**不含语义字段的合法raw config override被Agent拒绝但ACP Session仍可prompt
- **THEN**系统 SHALL继续发送prompt
- **AND**accepted或完成结果 SHALL包含该option的warning且不得声称设置成功

#### Scenario: 语义config设置失败

- **WHEN**包含`model`或`thought_level`的请求已唯一解析，但对应set RPC失败或没有返回完整config snapshot
- **THEN**系统 SHALL不发送prompt并返回`SPAWN_CONFIG_FAILED`
- **AND**系统 SHALL NOT在默认值或未确认值下执行正式任务

## ADDED Requirements

### Requirement: configuration_required 保留可续用的prepared Session

语义配置无法唯一完成时，`prompt_to_agent` SHALL返回`status=configuration_required`、owner-scoped spawned `sessionId`、`promptDispatched=false`、当前精简config snapshot与结构化issues。每个issue SHALL说明parameter、requested value、`unsupported | ambiguous | missing_category_option`原因、可选真实option ID/category及包含value/name/可选group/description的候选列表。

prepared Session SHALL持久化已解析ACP session ID、process generation、固定Workspace scope与完整live config snapshot，并 SHALL保持idle且可在当前process generation内通过同一spawned `sessionId`续用。它 SHALL NOT持久化未dispatch的user message、创建turn/response/notification、占用返回后的active capacity或运行inactivity watchdog。父Agent续聊时 SHALL重新校验live snapshot与精确选择；Agent process失效、应用重启或active handle丢失后 SHALL沿用既有expired语义。

#### Scenario: 后台请求在dispatch前需要配置选择

- **WHEN**`background=true`请求在真实Session中得到歧义model候选
- **THEN**tool SHALL直接返回`configuration_required`而不是`accepted`
- **AND**本次请求结算后 SHALL释放active reservation且不建立background notification

#### Scenario: 父Agent选择候选后续用prepared Session

- **WHEN**父Agent根据issues选择精确value，并以相同owner、agentId、spawned `sessionId`和原正式prompt再次调用
- **THEN**Main SHALL复用当前process generation内的active ACP Session并重新验证live config
- **AND**配置成功后 SHALL只为这次实际dispatch创建user message与turn record

#### Scenario: prepared Session承载进程已经失效

- **WHEN**父Agent续用prepared Session时原Agent process generation或active ACP handle已失效
- **THEN**系统 SHALL返回既有expired结果
- **AND** SHALL NOT在新process中静默重建并使用旧候选

### Requirement: prompt_to_agent字段描述完整指导语义配置

`prompt_to_agent`的Agent-facing总描述 SHALL说明首次调用可直接提供`model`与`thought_level`且无需probe，并说明Main在真实Session的live config中完成解析、设置和prompt dispatch。`model`字段description SHALL说明它解析`category=model`且不是option ID；`thought_level` SHALL说明它在model完整新snapshot之后解析`category=thought_level`；`config` SHALL说明key必须是精确live option ID、适用于mode/model_config/boolean/custom配置，并说明重复同值去重、冲突值拒绝。

总描述与字段description SHALL说明零候选或多候选返回`configuration_required`及options、不会发送prompt，并 SHALL指导父Agent利用已有上下文选择精确value或询问用户后续用同一Session。描述 SHALL NOT声称FylloCode能从initialize、`available_agents`、Agent默认provider或静态缓存预知Session支持的模型列表。

#### Scenario: 父Agent检查首次调用schema

- **WHEN**父Agent读取`prompt_to_agent` tool description与input schema
- **THEN**它 SHALL能区分`model`/`thought_level`语义value查询与`config`精确option ID映射
- **AND**它 SHALL知道精确或唯一匹配可在一次调用中完成，歧义时会收到候选且prompt尚未发送

#### Scenario: 父Agent收到configuration_required

- **WHEN**父Agent收到包含多个model candidates的`configuration_required`
- **THEN**结果与description SHALL提供足够的value/name/group上下文供其自行选择或询问用户
- **AND**父Agent SHALL无需读取错误字符串或创建返回`ok`的探测turn取得option ID
