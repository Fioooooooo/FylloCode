import { describe, expect, it } from "vitest";
import {
  SessionChatChannels,
  SessionChatProbeChannels,
  SessionChatStreamChannels,
} from "@shared/ipc/session/chat.channels";
import { ProposalBrowserChannels } from "@shared/ipc/proposal/browser.channels";
import { ProposalApplyChannels } from "@shared/ipc/proposal/apply.channels";
import { ProposalArchiveChannels } from "@shared/ipc/proposal/archive.channels";
import { PlatformSettingsChannels } from "@shared/ipc/platform/settings.channels";
import { PlatformReleaseChannels } from "@shared/ipc/platform/release.channels";
import { InsightOverviewChannels } from "@shared/ipc/insight/overview.channels";

describe("domain IPC channel constants", () => {
  it("keeps session chat channels under the session domain", () => {
    expect({
      chat: SessionChatChannels,
      stream: SessionChatStreamChannels,
      probe: SessionChatProbeChannels,
    }).toMatchInlineSnapshot(`
      {
        "chat": {
          "createSession": "session:chat:createSession",
          "listSessions": "session:chat:listSessions",
          "loadMessages": "session:chat:loadMessages",
          "persistMessage": "session:chat:persistMessage",
          "readAttachmentDataUrl": "session:chat:readAttachmentDataUrl",
          "removeSession": "session:chat:removeSession",
          "saveAttachment": "session:chat:saveAttachment",
          "setActionState": "session:chat:setActionState",
          "setConfigOption": "session:chat:setConfigOption",
          "updateSession": "session:chat:updateSession",
        },
        "probe": {
          "close": "session:chat:probe:close",
          "ensure": "session:chat:probe:ensure",
          "setConfigOption": "session:chat:probe:setConfigOption",
          "update": "session:chat:probe:update",
        },
        "stream": {
          "streamCancel": "session:chat:stream:cancel",
          "streamMessage": "session:chat:stream:message",
          "streamPort": "session:chat:stream:port",
        },
      }
    `);
  });

  it("splits proposal browser, apply, and archive channels by area", () => {
    expect({
      browser: ProposalBrowserChannels,
      apply: ProposalApplyChannels,
      archive: ProposalArchiveChannels,
    }).toMatchInlineSnapshot(`
      {
        "apply": {
          "apply": "proposal:apply:apply",
          "loadRun": "proposal:apply:loadRun",
          "loadRunMessages": "proposal:apply:loadRunMessages",
          "stageStream": "proposal:apply:stageStream",
          "stageStreamCancel": "proposal:apply:stageStream:cancel",
          "stageStreamPort": "proposal:apply:stageStream:port",
        },
        "archive": {
          "archive": "proposal:archive:archive",
          "archiveCancel": "proposal:archive:archive:cancel",
          "archivePort": "proposal:archive:archive:port",
          "loadArchive": "proposal:archive:loadArchive",
          "loadArchiveMessages": "proposal:archive:loadArchiveMessages",
        },
        "browser": {
          "getSpecDeltas": "proposal:browser:getSpecDeltas",
          "list": "proposal:browser:list",
          "readFile": "proposal:browser:readFile",
          "statusChanged": "proposal:browser:statusChanged",
          "watch": "proposal:browser:watch",
        },
      }
    `);
  });

  it("keeps platform and insight channels under their owner domains", () => {
    expect({
      settings: PlatformSettingsChannels,
      release: PlatformReleaseChannels,
      overview: InsightOverviewChannels,
    }).toMatchInlineSnapshot(`
      {
        "overview": {
          "getProjectOverview": "insight:overview:getProjectOverview",
        },
        "release": {
          "checkLatestRelease": "platform:release:checkLatestRelease",
        },
        "settings": {
          "get": "platform:settings:get",
          "getAppInfo": "platform:settings:getAppInfo",
          "update": "platform:settings:update",
        },
      }
    `);
  });
});
