The /executor invokes the Protocol as the Will commands, ever bound by the Codex

## Egress

The [protocols](.claude/skills/executor/protocols) name skills that live outside this
repo. `.claude/hooks/session-start.sh` fetches those four sources on every remote
session and leaves them in `.claude/sources/` (gitignored):

| Source | Named by |
| --- | --- |
| obra/Superpowers | `brainstorming`, `writing-plans`, `executing-plans`, `requesting-code-review`, `receiving-code-review` |
| mattpocock/skills | `grill-with-docs` |
| garrytan/gstack | `plan-eng-review` |
| Egonex-AI/Understand-Anything | freewill only |

Fetching is `git clone` over HTTPS, not a tarball download: the egress policy on
Claude Code on the web resolves `github.com/<repo>/archive/*.tar.gz` to
codeload.github.com and returns 403, and `api.github.com/repos/<repo>/tarball/*`
returns 403 for the same reason.

The hook downloads only. It registers nothing — no plugin install, no marketplace,
no `gstack ./setup` — so no skill from these sources is discovered or loaded into
session context. A protocol reaches its skill by reading the file, for example
`.claude/sources/gstack/plan-eng-review/SKILL.md`.

The hook is a no-op unless `CLAUDE_CODE_REMOTE=true`, since a local machine keeps
its own copies across sessions.
