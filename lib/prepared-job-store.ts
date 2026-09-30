import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import type { AutomationConfig } from "@/lib/config";
import { AutomationError } from "@/lib/errors";
import type { PoolCellValue, PreparedAppendJob } from "@/types/automation";

type PreparedJobStore = {
  save(job: PreparedAppendJob): Promise<void>;
  read(): Promise<PreparedAppendJob>;
};

function resolvePreparedJobPath(config: AutomationConfig): string {
  return isAbsolute(config.preparedJobFilePath)
    ? config.preparedJobFilePath
    : resolve(
        /*turbopackIgnore: true*/ process.cwd(),
        config.preparedJobFilePath,
      );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPoolCellValue(value: unknown): value is PoolCellValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function parsePreparedJob(value: unknown): PreparedAppendJob {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;

  if (!isRecord(parsed)) {
    throw new Error("Prepared job is not an object.");
  }

  if (
    parsed.status === "skipped" &&
    parsed.reason === "POOL_EMPTY" &&
    typeof parsed.preparedAt === "string" &&
    typeof parsed.expiresAt === "string"
  ) {
    return {
      status: "skipped",
      reason: "POOL_EMPTY",
      preparedAt: parsed.preparedAt,
      expiresAt: parsed.expiresAt,
    };
  }

  if (
    parsed.status === "ready" &&
    typeof parsed.preparedAt === "string" &&
    typeof parsed.expiresAt === "string" &&
    typeof parsed.spreadsheetToken === "string" &&
    typeof parsed.targetSheetId === "string" &&
    Array.isArray(parsed.values) &&
    parsed.values.every(isPoolCellValue) &&
    typeof parsed.startRow === "number" &&
    Number.isInteger(parsed.startRow) &&
    typeof parsed.endRow === "number" &&
    Number.isInteger(parsed.endRow) &&
    typeof parsed.targetRange === "string"
  ) {
    return {
      status: "ready",
      preparedAt: parsed.preparedAt,
      expiresAt: parsed.expiresAt,
      spreadsheetToken: parsed.spreadsheetToken,
      targetSheetId: parsed.targetSheetId,
      values: parsed.values,
      startRow: parsed.startRow,
      endRow: parsed.endRow,
      targetRange: parsed.targetRange,
    };
  }

  throw new Error("Prepared job has an invalid shape.");
}

export function createPreparedJobStore(
  config: AutomationConfig,
): PreparedJobStore {
  const filePath = resolvePreparedJobPath(config);
  const tempFilePath = `${filePath}.tmp`;

  return {
    async save(job) {
      try {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(tempFilePath, JSON.stringify(job), "utf8");
        await rename(tempFilePath, filePath);
      } catch (error) {
        throw new AutomationError({
          code: "PREPARED_JOB_WRITE_FAILED",
          provider: "filesystem",
          operation: "write",
          cause: error,
        });
      }
    },

    async read() {
      let rawValue: string;

      try {
        rawValue = await readFile(filePath, "utf8");
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          throw new AutomationError({
            code: "PREPARED_JOB_MISSING",
            provider: "filesystem",
            operation: "read",
            cause: error,
          });
        }

        throw new AutomationError({
          code: "PREPARED_JOB_READ_FAILED",
          provider: "filesystem",
          operation: "read",
          cause: error,
        });
      }

      try {
        return parsePreparedJob(rawValue);
      } catch (error) {
        throw new AutomationError({
          code: "PREPARED_JOB_INVALID",
          provider: "filesystem",
          operation: "read",
          cause: error,
        });
      }
    },
  };
}
