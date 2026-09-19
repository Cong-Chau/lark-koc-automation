# Lark Pool Automation Subplan 1: Foundation and Contracts

> **For agentic workers:** Execute this subplan with `.agents/skills/executing-plans/SKILL.md`. This subplan is the foundation for Subplans 2–6.

**Goal:** Add the Google dependency, static typecheck command, validated runtime configuration, shared provider interfaces, and sanitized error boundary used by the automation.

**Architecture:** Keep configuration and provider-independent types in `lib/` and `types/`. Provider adapters receive an `AutomationConfig` object and expose narrow interfaces so orchestration does not depend on SDK details.

**Tech Stack:** TypeScript, Zod, `googleapis` dependency declaration, existing Next.js/Lark/QStash project.

**Spec:** `lark_pool_automation_spec.md`

**Technical design:** `docs/specs/TECH.md`

## Constraints

- `PoolCellValue` is exactly `string | number | boolean`.
- Required runtime secrets and identifiers are validated before provider construction.
- Google private-key newlines are normalized with `replace(/\\n/g, "\n")`.
- Error objects and log helpers never serialize credentials, tokens, raw provider bodies, or Pool values.
- Do not add a database, queue, retry layer, lock, deduplication store, or Pool write capability.

## Task 1: Implement foundation and contracts

**Depends on:** none

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `types/automation.ts`
- Create: `lib/config.ts`
- Create: `lib/errors.ts`

**Interfaces:**
- Produces `PoolCellValue`, `AppendPlan`, `JobResult`, `LarkColumnRead`, `PoolReader`, and `TargetSheet`.
- Produces `getAutomationConfig(env?: NodeJS.ProcessEnv): AutomationConfig`.
- Produces `AutomationError` with safe `code`, `provider`, and `operation` metadata.

- [ ] **Step 1: Add dependency and static typecheck command**

Add `googleapis` to `dependencies` in `package.json` and add:

```json
"typecheck": "tsc --noEmit"
```

Update `pnpm-lock.yaml` with the repository's declared package manager. Keep the existing Next, React, Lark SDK, QStash, Zod, and lint versions unchanged.

- [ ] **Step 2: Define shared TypeScript contracts**

Create `types/automation.ts` with these exact boundaries:

```ts
export type PoolCellValue = string | number | boolean;

export type AppendPlan = {
  values: PoolCellValue[];
  startRow: number;
  endRow: number;
  targetRange: string;
};

export type JobResult =
  | { status: "success"; count: number; startRow: number; endRow: number }
  | { status: "skipped"; reason: "POOL_EMPTY" };

export type LarkColumnRead = {
  sheetId: string;
  range: string;
  startRow: number;
  values: unknown[][];
};

export interface PoolReader {
  readValues(): Promise<PoolCellValue[]>;
}

export interface TargetSheet {
  readColumnL(): Promise<LarkColumnRead>;
  writeColumnL(range: string, values: PoolCellValue[]): Promise<void>;
}
```

- [ ] **Step 3: Implement validated environment loading**

In `lib/config.ts`, validate these variables with Zod:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
GOOGLE_POOL_SPREADSHEET_ID
GOOGLE_POOL_SHEET_NAME
LARK_APP_ID
LARK_APP_SECRET
LARK_DOMAIN
LARK_TARGET_SPREADSHEET_TOKEN
LARK_TARGET_SHEET_ID
```

Return camel-cased configuration fields. Default `LARK_DOMAIN` to `lark` only when it is absent, reject empty strings, and normalize the Google private key with `replace(/\\n/g, "\n")`. Do not include secret values in validation errors.

- [ ] **Step 4: Implement sanitized provider errors**

In `lib/errors.ts`, implement `AutomationError` with these codes:

```text
CONFIG_INVALID
GOOGLE_AUTH_FAILED
GOOGLE_READ_FAILED
LARK_AUTH_FAILED
LARK_READ_FAILED
TARGET_RANGE_INVALID
LARK_WRITE_FAILED
PROVIDER_RESPONSE_INVALID
JOB_TIMEOUT
```

Store only provider, operation, code, and an optional provider request ID. Add a helper that converts an unknown caught value to safe log fields without serializing request headers, tokens, private keys, Pool values, or raw response bodies.

- [ ] **Step 5: Verify**

Run `npm run typecheck && npm run lint` and inspect the diff for only dependency, contract, configuration, and error-boundary changes.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml types/automation.ts lib/config.ts lib/errors.ts
git diff --cached --check
git commit -m "feat: add automation contracts and runtime config"
```
