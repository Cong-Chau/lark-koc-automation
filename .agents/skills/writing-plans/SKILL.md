---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Project tracking handoff

This project does not currently include a local `project-status` skill or
tracking registry. If the spec already has a tracking ID, reuse it and include
`**Tracking ID:** <id>` in the plan header. Otherwise, omit the tracking ID and
record the plan path in the final handoff.

## Overview

Write an implementation plan that an engineer with zero context for this
codebase can execute without asking questions: which files each task
touches, the code, and how to verify. DRY. YAGNI. Commit
per task.

The plan is written to be executed **fast**: fewer, larger tasks; explicit
dependencies so independent tasks run in parallel; verification after
implementation.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`
Create `docs/plans/` if it does not exist.

## Scope check

If the spec covers multiple independent subsystems, suggest one plan per
subsystem. Each plan produces working software on its own.

## Documents

The spec and the plan are the only documents the work produces. Do not
schedule tasks that write evidence, verification, handoff, review or
decision documents. Decisions made during execution amend the plan or go
in the executor's final message.

## File structure

Before defining tasks, map which files are created or modified and what
each is responsible for. One responsibility per file; files that change
together live together; follow existing patterns in the codebase.

## Task right-sizing

A task is the largest unit one implementer can finish in one dispatch and
one reviewer can judge in one pass: typically three to eight files, one
feature slice (api + model + ui for one capability). Fold setup,
scaffolding and configuration into the task that needs them. Split only
where a reviewer could reject one half while approving the other.

Small edits of the same kind (a constant, an i18n key, a field across
files) are one batched task, not many.

Every task declares **Depends on** so executors can schedule independent
tasks in parallel. Two tasks that touch the same file cannot run in
parallel: merge them, or make one depend on the other.

## Plan document header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

**Tracking ID:** [existing spec ID, if one was provided]

> **For agentic workers:** Use `.agents/skills/executing-plans/SKILL.md` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Spec:** [path to the spec this plan implements; executors read both]

## Global Constraints

[The spec's project-wide requirements: version floors, dependency limits,
naming and copy rules, platform requirements. One line each, exact values
copied verbatim from the spec. Every task implicitly includes this
section.]

## Task graph

| Task | Depends on | Parallel-safe with |
| --- | --- | --- |
| 1 | none | 2 |
| 2 | none | 1 |
| 3 | 1, 2 | none |

---
```

## Task structure

````markdown
### Task N: [Component Name]

**Depends on:** [task numbers, or "none"]

**Files:**
- Create: `app/api/example/route.ts`
- Modify: `exact/path/to/existing.ts:123-145`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks; exact signatures]
- Produces: [what later tasks rely on; exact names, parameter and return
  types. An implementer sees only its own task; this is how it learns the
  names its neighbours use.]

- [ ] **Step 1: Implement**

```ts
// the actual code, complete
```

- [ ] **Step 2: Verify**

Run the permitted static checks for the changed scope and inspect the diff.
Expected: checks pass and the diff matches the task without unrelated changes.

- [ ] **Step 3: Commit**

```bash
git add app/path/file.ts
git commit -m "feat: add specific feature"
```
````

## No placeholders

Every step contains the actual content. These are plan failures:

- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "handle edge cases"
- "Similar to Task N" (repeat the code; tasks are read out of order)
- Steps that describe without showing (code blocks for code steps)
- References to types or functions not defined in any task

## Self-review

After writing the plan, check it against the spec. This is a checklist you
run yourself, not a subagent dispatch:

1. **Spec coverage:** every requirement maps to a task. Add tasks for gaps.
2. **Placeholder scan:** none of the patterns above remain.
3. **Type consistency:** names and signatures used in later tasks match
   what earlier tasks define.
4. **Task graph:** every task's Depends-on agrees with its Consumes; no two
   parallel-safe tasks share a file.

Fix inline; no re-review.

## Execution handoff

After saving the plan:

**"Plan complete and saved to `docs/plans/<filename>.md`. Execute with:**

**Inline** — execute in this session with `.agents/skills/executing-plans/SKILL.md`

**Which approach?"**
