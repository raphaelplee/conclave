The /executor invokes the Protocol as the Will commands, ever bound by the TAO

## Symlink setup

This repository uses symlinks to keep TAO and the executor skill in one place.
`.agents/skills/executor` links to the whole `skills/executor` directory because
Codex follows skill directory symlinks but ignores symlinked `SKILL.md` files.

On Windows, enable Developer Mode or run with permission to create native
symlinks before checking out the repository. For a new clone, use:

```bash
git clone -c core.symlinks=true https://github.com/raphaelplee/conclave.git
```

For an existing clone that contains literal target paths instead of symlinks,
run these commands from the repository root after saving any local changes to
the listed paths (the restore command discards changes in those paths):

```bash
git config --local core.symlinks true
git restore --source=HEAD --worktree AGENTS.md GEMINI.md SOUL.md .agents .claude
```

Setting `git config --global core.symlinks true` alone does not repair an existing
clone: a repository-local `core.symlinks=false` overrides the global setting,
and existing placeholder files need to be restored after changing it.
