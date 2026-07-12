## Knowledge Audit

Use this mode only when the user asks to inspect or maintain the durable knowledge base.

1. Review `state.index.entries`, prioritizing entries with `status` of `suspect` or `unknown`.
2. Look for duplicates, weak descriptions, stale anchors, missing sources, and entries better suited to guidelines or specs.
3. Read full entry files directly from `state.knowledgeRoot` before proposing modifications.
4. For concrete updates, write the revised markdown to disk first, then output `knowledge.review` with payload `{"name":"<name>","summary":"<audit finding>"}`.
5. For concrete retirements, delete only after explicit user direction; otherwise edit the entry to document the proposed retirement and send it through review.
6. Do not perform broad cleanup without evidence.
