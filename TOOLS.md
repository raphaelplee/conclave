# Tools

Tools available to Claude Code in one claude.ai cloud session, recorded on 14 Nov 2026 and grouped by where they come from. The set changes with the environment, the app and the connected servers, so another session can differ.

- ✱ The tool's own description invites the model to use it without being asked.
- *Deferred*: listed by name only until loaded with `ToolSearch`. Their descriptions were not read, so a ✱ on a deferred tool is inferred from its name.

## `ccd_session`: Claude app session integration

Added partway through the session by an environment notice, not by the user or a repository.

- ✱ `spawn_task`: queues a suggested task as a card in the Claude app; nothing runs until someone starts it.
- `dismiss_task`: withdraws a queued suggestion.

## `claude-code-remote`: the cloud environment

- Sessions: `create_session`, `send_message`, `interrupt_session`, `archive_session`, `unarchive_session`, `get_session`, `list_sessions`, `list_events`, `get_event`, `set_session_title`, `set_session_tags`
- Scheduled tasks: `create_trigger`, `update_trigger`, `delete_trigger`, `fire_trigger`, `get_trigger`, `list_triggers`, `send_later`
- Environment: `get_environment`, `list_environments`, ✱ `create_environment`, ✱ `update_environment` (save a setup script "without waiting to be asked"), `switch_environment`, ✱ `request_credential` (ask for a key before a call fails)
- Repositories and GitHub: `add_repo`, `register_repo_root`, `list_repos`, `subscribe_pr_activity`, `unsubscribe_pr_activity`
- The user's computer: `list_computer_folders`, `request_computer_folder`, `confirm_repository_trust`
- Other: ✱ `read_documentation` (read whenever the environment comes up), ✱ `report_preview_port` (call whenever a web server runs), `watch_url`, `unwatch_url`

## `Claude_Docs`: editable documents

- `batch`, `guide`, `update`
- Deferred: `create`, `delete`, `export`, `query`, `read`

## `github`: GitHub (all deferred)

- Read: `get_me`, `get_file_contents`, `get_commit`, `list_commits`, `list_branches`, `list_tags`, `get_tag`, `list_releases`, `get_latest_release`, `get_release_by_tag`, `issue_read`, `list_issues`, `list_issue_types`, `list_issue_fields`, `pull_request_read`, `list_pull_requests`, `get_label`, `get_teams`, `get_team_members`, `list_repository_collaborators`, `get_check_run`, `get_job_logs`, `actions_get`, `actions_list`
- Write: `create_branch`, `create_or_update_file`, `delete_file`, `push_files`, `create_pull_request`, `update_pull_request`, `update_pull_request_branch`, `merge_pull_request`, `enable_pr_auto_merge`, `disable_pr_auto_merge`, `pull_request_review_write`, `add_comment_to_pending_review`, `add_reply_to_pull_request_comment`, `resolve_review_thread`, `unresolve_review_thread`, `request_copilot_review`, `issue_write`, `add_issue_comment`, `update_issue_comment`, `sub_issue_write`, `actions_run_trigger`, `run_secret_scanning`, `fork_repository`, `create_repository`

## `Indeed`: job search (all deferred)

- `search_jobs`, `get_job_details`, `get_company_data`, `get_resume`

## Claude Code built-in

- Core: `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `ToolSearch`, `Skill`, `AskUserQuestion`
- Agents: `Agent`, `ListAgents`; deferred: `SendMessage`
- Proactive: ✱ `Artifact` (may publish work without being asked), ✱ `SendUserFile` (has a proactive mode), ✱ `SuggestPluginInstall`, ✱ `SuggestSkills`, ✱ `SearchPlugins`; deferred: ✱ `SuggestConnectors`, ✱ `PushNotification`
- Other: `ReadNotifications`, `ReportFindings`, `ScheduleWakeup`, `ShowOnboardingRolePicker`
- Deferred: `ArtifactComments`, `ArtifactData`, `CronCreate`, `CronDelete`, `CronList`, `DesignSync`, `EnterPlanMode`, `ExitPlanMode`, `EnterWorktree`, `ExitWorktree`, `ListConnectors`, `ListPlugins`, `ListSkills`, `SearchSkills`, `SearchMcpRegistry`, `ListMcpResourcesTool`, `ReadMcpResourceTool`, `ReadMcpResourceDirTool`, `Monitor`, `NotebookEdit`, `WebSearch`, `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`, `TaskStop`

## Prompts that are not tools

- Recurring system reminders, such as "The task tools haven't been used recently… consider using TaskCreate".
- Skill trigger text, such as the `claude-api` skill's "TRIGGER — read FIRST… whenever the prompt names Claude/Anthropic".
