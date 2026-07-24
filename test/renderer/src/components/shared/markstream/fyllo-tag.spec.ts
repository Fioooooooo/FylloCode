import { describe, expect, it } from "vitest";
import { analyzeFylloTagMarkdown } from "@shared/fyllo-markdown/tag-analysis";
import {
  createFylloTagNodeTransformer,
  prepareFylloTagMarkdown,
  type FylloTagTransportConfig,
} from "@renderer/components/shared/markstream/fyllo-tag";

const actionConfig = {
  publicTagName: "fyllo-action",
  internalTagName: "fyllo-action-render",
  placeholderNamespace: "FYLLO_ACTION_LITERAL",
} satisfies FylloTagTransportConfig;

const signalConfig = {
  publicTagName: "fyllo-signal",
  internalTagName: "fyllo-signal-render",
  placeholderNamespace: "FYLLO_SIGNAL_LITERAL",
} satisfies FylloTagTransportConfig;

function prepareLiteral(config: FylloTagTransportConfig) {
  const source = `Example: <${config.publicTagName} type="show.time">{"label":"now"}</${config.publicTagName}>`;
  return {
    source,
    prepared: prepareFylloTagMarkdown(
      source,
      analyzeFylloTagMarkdown(source, { tagName: config.publicTagName }),
      config
    ),
  };
}

describe("Fyllo Markstream tag transport", () => {
  it("uses protocol-specific placeholder namespaces and restores nested text nodes", () => {
    const action = prepareLiteral(actionConfig);
    const signal = prepareLiteral(signalConfig);

    expect(action.prepared.placeholders[0].token).toContain("FYLLO_ACTION_LITERAL");
    expect(signal.prepared.placeholders[0].token).toContain("FYLLO_SIGNAL_LITERAL");
    expect(action.prepared.placeholders[0].token).not.toBe(signal.prepared.placeholders[0].token);

    const transformed = createFylloTagNodeTransformer(
      action.prepared,
      actionConfig
    )([
      {
        type: "paragraph",
        children: [{ type: "text", content: action.prepared.placeholders[0].token }],
      },
    ] as never);
    expect(JSON.stringify(transformed)).toContain(
      '<fyllo-action type=\\"show.time\\">{\\"label\\":\\"now\\"}</fyllo-action>'
    );
    expect(JSON.stringify(transformed)).not.toContain("FYLLO_ACTION_LITERAL");
  });

  it("does not rewrite its own internal node or the other protocol's content", () => {
    const action = prepareLiteral(actionConfig);
    const ownNode = {
      type: actionConfig.internalTagName,
      raw: action.prepared.placeholders[0].token,
      content: action.prepared.placeholders[0].token,
    };
    const otherNode = {
      type: signalConfig.internalTagName,
      raw: "unchanged signal raw",
      content: "unchanged signal content",
    };

    const transformed = createFylloTagNodeTransformer(
      action.prepared,
      actionConfig
    )([ownNode, otherNode] as never);

    expect(transformed[0]).toBe(ownNode);
    expect(transformed[1]).toEqual(otherNode);
  });
});
