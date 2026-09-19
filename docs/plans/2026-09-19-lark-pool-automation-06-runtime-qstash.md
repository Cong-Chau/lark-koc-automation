# Lark Pool Automation Subplan 6: Runtime Environment and QStash Schedule

> **For agentic workers:** Execute this subplan with `.agents/skills/executing-plans/SKILL.md` after Subplan 5.

**Goal:** Provide the non-secret runtime environment template and configure one stable QStash schedule that invokes the deployed route daily at 09:00 Vietnam time with no provider retry.

**Architecture:** Runtime secrets remain in Vercel environment variables. QStash owns the daily trigger and sends one POST to the deployed Next.js route; `QSTASH_TOKEN` is used only by the provisioning operator and is not bundled into the route runtime unless a provisioning script is added later.

**Tech Stack:** Vercel environment variables, Upstash QStash schedule, Next.js route `/api/append-koc`.

**Spec:** `lark_pool_automation_spec.md`

**Technical design:** `docs/specs/TECH.md`

## Constraints

- Do not commit real credentials, Pool values, target values, or `QSTASH_TOKEN`.
- Share the Google Pool with the service-account email as `Viewer`.
- Grant the Lark app the target spreadsheet read/write permission.
- Use exactly `CRON_TZ=Asia/Ho_Chi_Minh 0 9 * * *` and `retries: 0`.
- Keep one stable QStash schedule ID so repeated provisioning does not create duplicate schedules.
- The endpoint remains public as approved for MVP; repeated calls may append the same Pool again.

## Task 6: Configure runtime and QStash

**Depends on:** Subplan 5

**Files:**
- Create: `.env.example`

**Interfaces:**
- Consumes the route URL `/api/append-koc` and the environment contract from Subplan 1.
- Produces a deployment-ready environment template and one QStash schedule configuration.

- [ ] **Step 1: Add the non-secret environment template**

Create `.env.example` with empty values for:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_POOL_SPREADSHEET_ID=
GOOGLE_POOL_SHEET_NAME=
LARK_APP_ID=
LARK_APP_SECRET=
LARK_DOMAIN=lark
LARK_TARGET_SPREADSHEET_TOKEN=
LARK_TARGET_SHEET_ID=
```

Do not include real values or `QSTASH_TOKEN` in the repository template.

- [ ] **Step 2: Configure provider access**

For the deployment operator:

1. Enable Google Sheets API for the Google Cloud project.
2. Share the Google Pool spreadsheet with `GOOGLE_SERVICE_ACCOUNT_EMAIL` as `Viewer`.
3. Grant the Lark app the required read/write permission for the target spreadsheet.
4. Add all runtime variables to the Vercel environment, preserving escaped newlines in the Google private key.
5. Deploy the Next.js application and record its HTTPS URL.

- [ ] **Step 3: Provision one fixed QStash schedule**

Create or update one stable schedule ID with:

```text
Destination: https://<vercel-domain>/api/append-koc
Method: POST
Cron: CRON_TZ=Asia/Ho_Chi_Minh 0 9 * * *
Retries: 0
```

Use `QSTASH_TOKEN` only in the provisioning environment. Keep the endpoint public as approved for MVP and record that repeated calls can append the same Pool again.

- [ ] **Step 4: Verify**

Run `npm run typecheck && npm run lint`, inspect the final diff, and confirm that `.env.example` has no credential values and the QStash configuration has timezone `Asia/Ho_Chi_Minh` with retries set to `0`.

- [ ] **Step 5: Commit**

```bash
git add .env.example
git diff --cached --check
git commit -m "chore: add automation environment template"
```
