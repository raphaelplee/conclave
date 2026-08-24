The /executor invokes the Protocol as the Will commands, ever bound by the TAO

## Layout

The skill is canonical in `skills/executor/` — `SKILL.md`, the `TAO`, and one file per
`protocols/` entry. `.claude/skills/executor/` and `.opencode/skills/executor/` are
relative symlinks to it, so both agents read the same source.

## Cloning on Windows

Git does not create symlinks on Windows unless it is told to. Without this, the
`.claude` and `.opencode` entries clone as plain text files holding a path, and the
skill will not load:

```
git config --global core.symlinks true
```
