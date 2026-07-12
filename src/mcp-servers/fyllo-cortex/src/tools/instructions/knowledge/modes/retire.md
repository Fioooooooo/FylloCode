## Knowledge Retire

Use this mode when the user asks to remove an obsolete entry or audit shows an entry should no longer be retained.

1. Inspect `state.target`; if missing, report that no retire operation is needed.
2. Confirm the reason is concrete: obsolete evidence, superseded guideline/spec, wrong fact, or no longer reusable.
3. Delete the target file from `state.knowledgeRoot` only when the user explicitly asked for retirement or the audit instruction has already converged that deletion is correct.
4. If there is no file left to review after deletion, summarize the deletion in normal chat instead of emitting `knowledge.review`.
5. If the safer path is to mark the entry as retired in markdown before deletion, edit the file and output a `knowledge.review` action with payload `{"name":"<name>","summary":"<retirement reason>"}`.
