// Request-response channels: domain:action
export const ChatChannels = {
  listSessions: "chat:listSessions",
  createSession: "chat:createSession",
  updateSession: "chat:updateSession",
  removeSession: "chat:removeSession",
  loadMessages: "chat:loadMessages",
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
  loadArchive: "proposal:loadArchive",
  loadArchiveMessages: "proposal:loadArchiveMessages",
} as const;

export const TaskChannels = {
  get: "task:get",
  list: "task:list",
  create: "task:create",
  update: "task:update",
  delete: "task:delete",
} as const;

export const IntegrationChannels = {
  getConnections: "integration:getConnections",
  connect: "integration:connect",
  disconnect: "integration:disconnect",
  providersList: "integrations:providers:list",
  providersConnect: "integrations:providers:connect",
  providersDisconnect: "integrations:providers:disconnect",
  providersProbe: "integrations:providers:probe",
  providersListResources: "integrations:providers:listResources",
  projectGet: "integrations:project:get",
  projectSet: "integrations:project:set",
} as const;

export const SettingsChannels = {
  get: "settings:get",
  getAppInfo: "settings:getAppInfo",
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
  agentUnavailable: "acp:event:agentUnavailable",
} as const;
