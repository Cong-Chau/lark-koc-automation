export const AUTOMATION_ERROR_CODES = [
  "CONFIG_INVALID",
  "GOOGLE_AUTH_FAILED",
  "GOOGLE_READ_FAILED",
  "LARK_AUTH_FAILED",
  "LARK_READ_FAILED",
  "TARGET_RANGE_INVALID",
  "LARK_WRITE_FAILED",
  "REDIS_READ_FAILED",
  "REDIS_WRITE_FAILED",
  "PREPARED_JOB_MISSING",
  "PREPARED_JOB_EXPIRED",
  "PREPARED_JOB_INVALID",
  "PROVIDER_RESPONSE_INVALID",
  "JOB_TIMEOUT",
] as const;

export type AutomationErrorCode = (typeof AUTOMATION_ERROR_CODES)[number];

export type AutomationProvider =
  "config" | "google" | "lark" | "qstash" | "redis" | "internal";

export type AutomationOperation =
  "config" | "create" | "read" | "write" | "prepare" | "job";

export type AutomationErrorOptions = {
  code: AutomationErrorCode;
  provider: AutomationProvider;
  operation: AutomationOperation;
  requestId?: string;
  cause?: unknown;
};

export class AutomationError extends Error {
  readonly code: AutomationErrorCode;
  readonly provider: AutomationProvider;
  readonly operation: AutomationOperation;
  readonly requestId?: string;

  constructor(options: AutomationErrorOptions) {
    super(options.code);
    this.name = "AutomationError";
    this.code = options.code;
    this.provider = options.provider;
    this.operation = options.operation;
    this.requestId = options.requestId;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export type SafeErrorFields = {
  errorCode?: AutomationErrorCode;
  provider?: AutomationProvider;
  operation?: AutomationOperation;
  requestId?: string;
  errorType?: string;
};

export function toSafeErrorFields(error: unknown): SafeErrorFields {
  if (error instanceof AutomationError) {
    return {
      errorCode: error.code,
      provider: error.provider,
      operation: error.operation,
      ...(error.requestId ? { requestId: error.requestId } : {}),
    };
  }

  return {
    errorType: error instanceof Error ? error.name : "UnknownError",
  };
}
