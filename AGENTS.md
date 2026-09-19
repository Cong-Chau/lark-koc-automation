# AGENTS.md

## Project Overview

This project is a small automation service that moves data from a Lark Pool Sheet into column L of the `KOC List Official` sheet every day at 09:00 Asia/Ho_Chi_Minh.

Main flow:

1. User manually refreshes the Pool Sheet before 09:00.
2. QStash triggers the Vercel endpoint at 09:00.
3. The API reads all active rows from the Pool Sheet.
4. The API finds the last occupied row in column L of the target sheet.
5. The API appends the Pool data below the existing data.
6. The job stops after success or failure.

The application must remain intentionally simple.

---

## Tech Stack

- TypeScript
- Next.js App Router
- Next.js Route Handlers
- Vercel
- Upstash QStash
- Lark Open API
- `@larksuiteoapi/node-sdk`
- `zod` for environment validation

No database is used.

No authentication layer is required for the automation endpoint.

No queue system is required.

---

## Core Business Rules

These rules are important and must not be changed unless explicitly requested.

### Pool Sheet

The user is responsible for refreshing the Pool Sheet every morning.

The application must:

- read the current Pool Sheet data;
- ignore empty rows;
- preserve the original order;
- never modify the Pool Sheet;
- never clear the Pool Sheet;
- never mark rows as processed.

### Target Sheet

Target:

`KOC List Official`

Destination:

`Column L`

The application must:

- find the last occupied row in column L;
- append new values below it;
- never overwrite existing values;
- never modify unrelated columns.

### Duplicate Handling

Do not perform duplicate detection.

If the Pool contains duplicate values, append them as-is.

If a value already exists in the target sheet from a previous day, append it again if it exists in today's Pool.

### Empty Pool

If the Pool Sheet contains no valid data:

- do not write anything;
- return a successful/skipped response;
- do not treat this as an error.

Example:

```json
{
  "status": "skipped",
  "reason": "POOL_EMPTY"
}
```
