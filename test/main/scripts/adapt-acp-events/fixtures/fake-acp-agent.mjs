#!/usr/bin/env node

import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const mode = process.env.FAKE_ACP_MODE ?? "success";
const sessionId = "fake-session";
let promptCount = 0;

if (mode.startsWith("environment-failure")) {
  if (mode.endsWith("-large")) process.stderr.write("x".repeat(70_000));
  if (process.env.PRIVATE_SAMPLE_VALUE) {
    process.stderr.write(`private=${process.env.PRIVATE_SAMPLE_VALUE}\n`);
  }
  process.stderr.write(
    "[logger] write failed: EPERM\n[unexpected] Error: EMFILE: too many open files, watch\n"
  );
}

const stream = acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin));

acp
  .agent({ name: "adapt-acp-events-test-agent" })
  .onRequest(acp.methods.agent.initialize, async () => {
    if (mode.startsWith("environment-failure")) {
      throw new Error("fake initialize failure");
    }
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: { loadSession: false },
    };
  })
  .onRequest(acp.methods.agent.session.new, async (context) => {
    await context.client.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "usage_update",
        used: 1,
        size: 10,
      },
    });
    return { sessionId };
  })
  .onRequest(acp.methods.agent.session.prompt, async (context) => {
    promptCount += 1;
    if (mode === "hang-prompt") {
      await new Promise(() => {});
    }

    const toolCallId = `fake-tool-${promptCount}`;
    await context.client.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId,
        title: "Fake tool",
        kind: "other",
        status: "pending",
        rawInput: { scenario: promptCount },
      },
    });
    const permission = await context.client.request(acp.methods.client.session.requestPermission, {
      sessionId,
      toolCall: {
        toolCallId,
        title: "Fake tool",
        kind: "other",
        status: "pending",
        rawInput: { scenario: promptCount },
      },
      options:
        mode === "no-allow"
          ? [
              {
                kind: "reject_once",
                name: "Reject once",
                optionId: "reject-once",
              },
            ]
          : [
              {
                kind: "allow_once",
                name: "Allow once",
                optionId: "allow-once",
              },
            ],
    });
    await context.client.notify(acp.methods.client.session.update, {
      sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId,
        status: permission.outcome.outcome === "selected" ? "completed" : "failed",
        content: [],
      },
    });
    return { stopReason: "end_turn" };
  })
  .onNotification(acp.methods.agent.session.cancel, async () => {})
  .connect(stream);
