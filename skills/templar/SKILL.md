---
name: templar
description: The templar guards every call to the model with the guardrails the work demands
argument-hint: work="<intent | command | description>"
disable-model-invocation: true
---

# templar
1. Intent. State the intent of the work, and the domains and industries involved
2. Survey. List the guardrails available in the working repositories, the user's agent config (`~/.claude`, `~/.codex`, `~/.gemini`, `~/.agents`) and this repository. A guardrail is any file that binds behaviour, e.g. `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `SOUL.md`, principles, ideology, standards, protocols, `TAO`, `CONTRIBUTING.md`, `SECURITY.md`, `.cursorrules`, `.github/copilot-instructions.md`. Resolve symlinks and `@` imports. One entry per real file
3. Choose. Keep the guardrails suitable to the intent, drop the rest. Show the mapping as a table: intent, guardrail, reason
4. Guard. Attach the contents of the chosen guardrails, verbatim, in every single call to the model. Re-attach after compaction or summarisation
5. Delegate. Before every call to a subagent or another model, run steps 1–3 on its work. Start its prompt with its guardrails and this skill, so it guards its own calls and subagents the same way
6. Work. Do the work, bound by the guardrails

`/templar work="review legaltech architecture"`

```xml
<guardrails>
<guardrail path="skills/executor/TAO">
contents
</guardrail>
</guardrails>
```
