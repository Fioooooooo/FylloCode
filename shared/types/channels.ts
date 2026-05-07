// Request-response channels: domain:action
export const ChatChannels = {
  listSessions: "chat:listSessions",
  getSession: "chat:getSession",
  createSession: "chat:createSession",
  updateSession: "chat:updateSession",
  removeSession: "chat:removeSession",
  loadMessages: "chat:loadMessages",
  sendMessage: "chat:sendMessage",
  persistMessage: "chat:persistMessage",
} as const;

export const ChatStreamChannels = {
  streamMessage: "chat:stream:message",
  streamPort: "chat:stream:port",
  streamCancel: "chat:stream:cancel",
} as const;

export const ProjectChannels = {
  list: "project:list",
  getById: "project:getById",
  getDefaultPath: "project:getDefaultPath",
  create: "project:create",
  update: "project:update",
  remove: "project:remove",
  openFolder: "project:openFolder",
} as const;

export const ProposalChannels = {
  list: "proposal:list",
  readFile: "proposal:readFile",
  apply: "proposal:apply",
  stageStream: "proposal:stageStream",
  stageStreamPort: "proposal:stageStream:port",
  stageStreamCancel: "proposal:stageStream:cancel",
  archive: "proposal:archive",
  archivePort: "proposal:archive:port",
  archiveCancel: "proposal:archive:cancel",
  loadRun: "proposal:loadRun",
  loadRunMessages: "proposal:loadRunMessages",
} as const;

export const NetChannels = {
  fetch: "net:fetch",
  fetchImage: "net:fetchImage",
} as const;

export const IntegrationChannels = {
  listTools: "integration:listTools",
  getConnections: "integration:getConnections",
  getConnection: "integration:getConnection",
  connect: "integration:connect",
  disconnect: "integration:disconnect",
  listProjectConfigs: "integration:listProjectConfigs",
  setProjectConfig: "integration:setProjectConfig",
  listCustom: "integration:listCustom",
  createCustom: "integration:createCustom",
  removeCustom: "integration:removeCustom",
  yunxiaoSetToken: "integration:yunxiao:setToken",
  yunxiaoSetOrganization: "integration:yunxiao:setOrganization",
} as const;

export const SettingsChannels = {
  get: "settings:get",
  update: "settings:update",
} as const;

export const WorkflowChannels = {
  list: "workflow:list",
  save: "workflow:save",
  delete: "workflow:delete",
} as const;

export const AcpAgentChannels = {
  getRegistry: "acp:getRegistry",
  refreshRegistry: "acp:refreshRegistry",
  getIcons: "acp:getIcons",
  detectStatus: "acp:detectStatus",
  install: "acp:install",
  registryUpdated: "acp:registryUpdated",
  installProgress: "acp:installProgress",
} as const;

export const WindowChannels = {
  minimize: "window:minimize",
  maximize: "window:maximize",
  close: "window:close",
  toggleDevTools: "window:toggleDevTools",
  isMaximized: "window:isMaximized",
} as const;
