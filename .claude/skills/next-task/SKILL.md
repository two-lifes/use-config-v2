---
name: next-task
description: Execute and verify exactly one next unfinished numbered task from docs/tasks.md, then propose completion marks, a commit and a push.
disable-model-invocation: true
---

# next-task

Runs only when the user explicitly invokes `/next-task`. Creating, editing or
discussing this skill does not invoke it. Follow the root `CLAUDE.md`. Paths are
relative to the repository root.

One invocation handles one numbered `X.Y` task from `docs/tasks.md`, followed by
verification and a proposal to record completion, commit and push.

## 1. Locate the next task

1. Read `CLAUDE.md`, `docs/tasks.md`, `docs/decisions.md` and the documents the
   task refers to. Check `git status` and preserve existing user changes.
2. `[x]` marks in `docs/tasks.md` are the progress record. Select the first
   unchecked numbered `X.Y` task in document order. Checkpoint rows (`C1`…) are
   not tasks. Do not skip earlier gaps.
3. Report the last completed task (or that none is completed) and the selected
   task ID and title.
4. Inspect existing work for the selected task. If it is already implemented
   but not marked, verify it and propose the mark instead of redoing it. Do not
   infer completion from a commit message alone.
5. If the previous stage's checkpoint is open, check whether its outcome is
   verified; if so, propose closing it before advancing.
6. If the task depends on a **Proposed** decision in `docs/decisions.md` that
   the user has not confirmed, ask for the decision before implementing the
   dependent behavior. Group the questions and give options with consequences.
   Work that does not depend on it may proceed.
7. If all numbered tasks are checked, report open checkpoints or that the plan
   is complete. Do not invent new tasks.

## 2. Execute exactly one task

- The invocation authorizes the selected task, including writing code. It does
  not authorize other tasks, a commit, a push or publication.
- Complete everything the task requires, add or update tests for its behavior,
  and fix defects the change introduced. No unrelated refactoring and no work
  from other tasks.
- Check library APIs against current documentation (Context7), not memory.
- Interface text and documentation are English; follow `docs/design.md` for UI.
- If the task changes a requirement, decision or command, update the related
  documents (`docs/*.md`, the commands section of `CLAUDE.md`).

## 3. Verify

Use the commands from the "Команды проекта" section of `CLAUDE.md`. Determine
from the document structure whether the task is the last numbered task of its
stage.

| Task position | Required verification |
|---|---|
| Not the last task of its stage | Type check, lint, format check, unit tests, and the end-to-end tests relevant to the change. Add functional checks proving the task works. |
| Last task of its stage | Stage review: review the stage's diff for quality, then run the full `npm run check` (type check, lint, format check, build, all unit and end-to-end tests) and confirm the checkpoint outcome, including regressions in earlier behavior. |
| Documentation-only task | Check links, task numbering, terminology and requirement consistency. Do not run builds or tests. |

- Investigate and fix failures caused by the task and rerun the affected checks.
  Report unrelated failures separately. Never describe a failed or skipped check
  as passing.
- Checks that need the user's own Chrome (task 4.3) cannot run here; report
  them as not run and leave the task open until the user confirms.
- Close a checkpoint only when all its tasks are done and its outcome is
  verified.

## 4. Propose finalization

After work and verification, report briefly:

1. Task ID, outcome and changed files.
2. Checks that passed, failed or could not run, and any blockers.
3. Proposed documentation updates: `[ ]` → `[x]` for the task, the checkpoint
   with a date/environment/checks note if eligible, the "Status" line of
   `docs/tasks.md`, and the "Текущее состояние" section of `CLAUDE.md`.
4. A proposed commit message and the branch and remote for the push, if a
   remote is configured.
5. An offer to apply these updates, commit and push.

Do not apply marks, commit or push just because `/next-task` was invoked; wait
for the user's answer, unless the user has already explicitly authorized these
actions for the current work.

On approval: apply only justified marks and agreed edits, review the final
diff, stage only the intended files (no blanket staging), commit, and push to
the confirmed destination. Never force-push. Commit messages contain no AI
attribution lines. If the remote is absent or ambiguous, ask before pushing.
Report the actual commit and push result. Finalizing does not start the next
task.

If implementation or verification is incomplete, keep marks open, report the
blocker and do not propose recording completion. A partial-work commit must be
named as incomplete and authorized separately.
