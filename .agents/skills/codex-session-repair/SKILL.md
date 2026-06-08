---
name: codex-session-repair
description: Repair Codex CLI session JSONL files after invalid_encrypted_content errors, "encrypted content could not be decrypted or parsed", or turns failing because stored response reasoning encrypted_content cannot be verified. Use when the user provides a Codex thread id or a ~/.codex/sessions rollout-*.jsonl path and asks to fix or recover that conversation.
---

# Codex Session Repair

Use this skill to repair local Codex session JSONL files that fail on the next turn because a stored encrypted reasoning item cannot be decrypted. The safe fix is to remove hidden reasoning records that contain `encrypted_content` while preserving visible conversation, tool calls, tool outputs, and turn metadata.

## Scope

- Only operate on Codex session files under `.codex/sessions/**/rollout-*.jsonl`.
- Do not modify project source files for this repair unless the user explicitly asks for a product fix too.
- If the target file is outside the writable workspace, request escalation before writing.
- Always create a backup before changing the session file.
- Never print full `encrypted_content` values. Print only line number, timestamp, length, and short prefix/suffix.

## Workflow

1. Identify the target session file.
   - If the user gives a file path, use that exact path.
   - If the user gives only a thread id, search under `~/.codex/sessions` for a matching `rollout-*<thread-id>.jsonl`.
2. Inspect the tail of the file to understand the most recent turn.
   - A failed retry often ends with a user message followed by `task_complete` where `last_agent_message` is `null`.
3. Locate encrypted reasoning records without dumping secrets:

```bash
node -e 'const fs=require("fs"); const p=process.argv[1]; const lines=fs.readFileSync(p,"utf8").trimEnd().split(/\n/); for (let i=0;i<lines.length;i++){let o; try{o=JSON.parse(lines[i])}catch(e){console.log(JSON.stringify({line:i+1,invalid:e.message})); continue} const payload=o.payload||{}; const enc=payload.encrypted_content; if(enc){console.log(JSON.stringify({line:i+1,timestamp:o.timestamp,type:o.type,payloadType:payload.type,len:enc.length,start:enc.slice(0,6),end:enc.slice(-12),summaryLen:Array.isArray(payload.summary)?payload.summary.length:undefined}))}}' <session-file>
```

4. If the API error includes a visible suffix such as `...jYyl`, match it against the `end` field from the previous command to confirm the bad record.
5. Repair by removing only response items whose payload is hidden reasoning with `encrypted_content`:

```bash
node -e 'const fs=require("fs"); const p=process.argv[1]; const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\..*/,""); const bak=`${p}.bak-invalid-encrypted-${stamp}`; const input=fs.readFileSync(p,"utf8"); fs.writeFileSync(bak,input); const lines=input.trimEnd().split(/\n/); const kept=[]; let removed=0; for (let i=0;i<lines.length;i++){const line=lines[i]; if(!line.trim()) continue; const o=JSON.parse(line); const payload=o.payload||{}; const isBad=o.type==="response_item"&&payload.type==="reasoning"&&typeof payload.encrypted_content==="string"; if(isBad){removed++; continue} kept.push(line)} fs.writeFileSync(p,kept.join("\n")+"\n"); console.log(JSON.stringify({backup:bak,kept:kept.length,removed}))' <session-file>
```

6. Validate the repaired file:

```bash
rg -n 'encrypted_content' <session-file>
node -e 'const fs=require("fs"); const p=process.argv[1]; const lines=fs.readFileSync(p,"utf8").trimEnd().split(/\n/); const invalid=[]; for(let i=0;i<lines.length;i++){try{JSON.parse(lines[i])}catch(e){invalid.push({line:i+1,error:e.message})}} console.log(JSON.stringify({lines:lines.length,invalidCount:invalid.length,invalid:invalid.slice(0,5)}))' <session-file>
ls -l <session-file> <backup-file>
```

`rg` exits with code `1` when no matches are found; that is expected here.

## Repair Rules

- Prefer JSON parsing over regex-based line deletion.
- Remove all matching encrypted reasoning records, not only the one named in the error. Other encrypted reasoning records can fail on future turns.
- Keep `event_msg`, user messages, assistant `output_text`, tool calls, tool outputs, token counts, and `task_complete` records.
- If a reasoning item has a non-empty `summary`, do not delete it blindly. Preserve the summary by replacing the payload with `{ "type": "reasoning", "summary": [...] }`, or ask the user before discarding it.
- If validation finds malformed JSONL unrelated to encrypted reasoning, stop and inspect that line before writing another repair.

## Final Response

Report:

- the repaired file path
- the backup file path
- how many encrypted reasoning records were removed
- validation result: no `encrypted_content` remaining and JSONL parses cleanly
