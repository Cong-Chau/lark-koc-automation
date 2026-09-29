import { Redis } from "@upstash/redis";

import type { AutomationConfig } from "@/lib/config";
import { AutomationError } from "@/lib/errors";
import type { PoolCellValue, PreparedAppendJob } from "@/types/automation";

const PREPARED_JOB_KEY = "lark-koc-automation:prepared-job";
const TTL_GRACE_SECONDS = 300;

type PreparedJobStore = {
  save(job: PreparedAppendJob): Promise<void>;
  read(): Promise<PreparedAppendJob>;
};

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
  const redis = new Redis({
    url: config.upstashRedisRestUrl,
    token: config.upstashRedisRestToken,
  });
  const ttlSeconds = config.preparedJobMaxAgeSeconds + TTL_GRACE_SECONDS;

  return {
    async save(job) {
      try {
        await redis.set(PREPARED_JOB_KEY, JSON.stringify(job), {
          ex: ttlSeconds,
        });
      } catch (error) {
        throw new AutomationError({
          code: "REDIS_WRITE_FAILED",
          provider: "redis",
          operation: "write",
          cause: error,
        });
      }
    },

    async read() {
      let rawValue: unknown;

      try {
        rawValue = await redis.get(PREPARED_JOB_KEY);
      } catch (error) {
        throw new AutomationError({
          code: "REDIS_READ_FAILED",
          provider: "redis",
          operation: "read",
          cause: error,
        });
      }

      if (rawValue === null) {
        throw new AutomationError({
          code: "PREPARED_JOB_MISSING",
          provider: "redis",
          operation: "read",
        });
      }

      try {
        return parsePreparedJob(rawValue);
      } catch (error) {
        throw new AutomationError({
          code: "PREPARED_JOB_INVALID",
          provider: "redis",
          operation: "read",
          cause: error,
        });
      }
    },
  };
}
