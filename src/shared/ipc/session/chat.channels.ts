export const SessionChatChannels = {
  listSessions: "session:chat:listSessions",
  createSession: "session:chat:createSession",
  updateSession: "session:chat:updateSession",
  removeSession: "session:chat:removeSession",
  loadMessages: "session:chat:loadMessages",
  persistMessage: "session:chat:persistMessage",
  saveAttachment: "session:chat:saveAttachment",
  readAttachmentDataUrl: "session:chat:readAttachmentDataUrl",
  setConfigOption: "session:chat:setConfigOption",
} as const;

export const SessionChatStreamChannels = {
  streamMessage: "session:chat:stream:message",
  streamPort: "session:chat:stream:port",
  streamCancel: "session:chat:stream:cancel",
} as const;

export const SessionChatProbeChannels = {
  ensure: "session:chat:probe:ensure",
  close: "session:chat:probe:close",
  setConfigOption: "session:chat:probe:setConfigOption",
  update: "session:chat:probe:update",
} as const;
