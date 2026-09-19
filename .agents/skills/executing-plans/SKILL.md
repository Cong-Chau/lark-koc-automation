---
name: executing-plans
description: Use when you have a written implementation plan to execute inline in this session without subagents
---

# Executing Plans

Load the plan, execute every task without stopping, run only the permitted
static checks, verify, hand off.

**Testing policy:** This skill must never execute tests. Do not run test
commands, test runners, test scripts, or full-suite commands that include
tests. Do not add a test command to any verification step.

**Announce at start:** "I'm using the executing-plans skill to implement this plan."

This project uses the inline workflow. No subagent skill is bundled under
`.agents/skills/`, so do not reference an external subagent namespace.


## Documents

The spec and the plan are the only documents. Do not write evidence,
verification, handoff or decision notes under `docs/`. Decisions go in your
final message; a decision that changes the plan amends the plan.

## Process

### 1. Load

1. Use an isolated linked worktree when implementation changes are required.
   Never implement on main/master without explicit consent.
2. Read the plan and the spec it names once. Note Global Constraints and
   each task's Files and Depends-on lines. Create a todo per task.
3. A plan defect or ambiguity is yours to rule on; the spec is the
   authority. Note the ruling for your final message and continue. Stop
   only if every path forward is a guess.

### 2. Execute

Work through tasks in dependency order. Batch tasks that are small edits
of the same kind (constants, i18n keys, a field across files) into one
pass with one commit.

Per task:

1. Implement what the task specifies, following neighbouring code.
2. Do not run tests or invoke any test runner.
3. Commit: `git add <files> && git commit -m "<type>: <summary>"`.
4. Mark the todo complete.

Every third task, and after any task touching shared foundations (router,
providers, `shared/ui`, query keys), run the static gate and fix what it
reports before moving on:

```bash
npm run typecheck && npm run lint
```

### 3. Finish

1. Run the static gate once more on the final tree and report its actual
   output, failures included. Do not run tests.
2. List the rulings you made in your final message, each with its cost if
   wrong.
3. Record the tracking outcome in the final handoff when a tracking ID exists.
4. Hand off the branch summary. Do not merge, push, or publish automatically.

## Only these stop you

- An irreversible or destructive operation
- A security-sensitive action
- A side effect outside the worktree: a merge, a push to a shared branch, a publish
- A plan so broken that every path forward is a guess

Everything else (an unclear instruction, a failing static check, or a missing
dependency) you investigate systematically, decide, and continue. "Should I
continue?" prompts cost your human partner their day and buy nothing.
