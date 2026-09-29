import { createGooglePoolReader } from "@/lib/google-sheets";
import { createLarkClient } from "@/lib/lark-client";
import { createLarkTargetSheet } from "@/lib/lark-sheets";
import { resolveLarkSpreadsheetToken } from "@/lib/lark-wiki";
import { createAppendPlan } from "@/lib/append-plan";
import { getAutomationConfig, type AutomationConfig } from "@/lib/config";
import { AutomationError } from "@/lib/errors";
import { createPreparedJobStore } from "@/lib/prepared-job-store";
import { logRuntimeInfo } from "@/lib/runtime-log";
import type {
  JobResult,
  PoolReader,
  PreparedAppendJob,
  TargetSheet,
} from "@/types/automation";

export type AppendTrigger = "qstash" | "manual";

export type AppendKocDependencies = {
  poolReader: PoolReader;
  targetSheet: TargetSheet;
};

type RuntimeLogOperation = "append-koc" | "prepare-koc";

type DefaultDependencies = AppendKocDependencies & {
  getSpreadsheetToken: () => Promise<string>;
};

function logDevInfo(
  enabled: boolean,
  input: Parameters<typeof logRuntimeInfo>[0],
): void {
  if (enabled) {
    logRuntimeInfo(input);
  }
}

function createExpiresAt(maxAgeSeconds: number): string {
  return new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
}

function assertPreparedJobIsFresh(
  job: PreparedAppendJob,
  maxAgeSeconds: number,
): void {
  const expiresAt = Date.parse(job.expiresAt);
  const preparedAt = Date.parse(job.preparedAt);

  if (
    Number.isNaN(expiresAt) ||
    Number.isNaN(preparedAt) ||
    Date.now() > expiresAt ||
    Date.now() - preparedAt > maxAgeSeconds * 1000
  ) {
    throw new AutomationError({
      code: "PREPARED_JOB_EXPIRED",
      provider: "redis",
      operation: "read",
    });
  }
}

function createDefaultDependencies(
  config: AutomationConfig,
  logSteps: boolean,
  runId: string,
  trigger: AppendTrigger,
  operation: RuntimeLogOperation,
): DefaultDependencies {
  const larkClient = createLarkClient(config);
  let spreadsheetTokenPromise: Promise<string> | undefined;

  function getSpreadsheetToken(): Promise<string> {
    spreadsheetTokenPromise ??= (async () => {
      logDevInfo(logSteps, {
        operation,
        runId,
        trigger,
        phase: "lark_wiki_resolve_started",
        message: "Bắt đầu resolve Lark Wiki node",
        status: "started",
      });

      const spreadsheetToken = await resolveLarkSpreadsheetToken(
        config,
        larkClient,
      );

      logDevInfo(logSteps, {
        operation,
        runId,
        trigger,
        phase: "lark_wiki_resolve_finished",
        message: "Đã resolve Lark Wiki node",
        status: "success",
      });

      return spreadsheetToken;
    })();

    return spreadsheetTokenPromise;
  }

  return {
    getSpreadsheetToken,
    poolReader: createGooglePoolReader(config),
    targetSheet: createLarkTargetSheet(
      {
        larkTargetSheetId: config.larkTargetSheetId,
        getSpreadsheetToken,
      },
      larkClient,
    ),
  };
}

async function writePreparedJob(
  targetSheet: TargetSheet,
  job: Extract<PreparedAppendJob, { status: "ready" }>,
  startedAt: number,
  runId: string,
  trigger: AppendTrigger,
  logSteps: boolean,
): Promise<JobResult> {
  logDevInfo(logSteps, {
    operation: "append-koc",
    runId,
    trigger,
    phase: "lark_write_started",
    message: "Bắt đầu ghi vào target sheet",
    status: "started",
    details: { startRow: job.startRow, endRow: job.endRow },
  });

  await targetSheet.writeColumnL(job.targetRange, job.values);

  const result: JobResult = {
    status: "success",
    count: job.values.length,
    startRow: job.startRow,
    endRow: job.endRow,
  };

  logRuntimeInfo({
    operation: "append-koc",
    runId,
    trigger,
    phase: "target_sheet_written",
    message: "Đã ghi xong target sheet",
    status: "success",
    details: {
      poolCount: result.count,
      startRow: result.startRow,
      endRow: result.endRow,
      targetRange: job.targetRange,
      durationMs: Date.now() - startedAt,
    },
  });

  return result;
}

export async function runPrepareKoc(
  runId: string,
  trigger: AppendTrigger = "manual",
): Promise<PreparedAppendJob> {
  const startedAt = Date.now();
  const config = getAutomationConfig();
  const logSteps = config.dev;
  const store = createPreparedJobStore(config);
  const runtimeDependencies = createDefaultDependencies(
    config,
    logSteps,
    runId,
    trigger,
    "prepare-koc",
  );

  logDevInfo(logSteps, {
    operation: "prepare-koc",
    runId,
    trigger,
    phase: "prepare_job_started",
    message: "Bắt đầu job chuẩn bị dữ liệu",
    status: "started",
  });

  logDevInfo(logSteps, {
    operation: "prepare-koc",
    runId,
    trigger,
    phase: "google_pool_read_started",
    message: "Bắt đầu đọc Google Pool",
    status: "started",
  });

  const poolValues = await runtimeDependencies.poolReader.readValues();

  logDevInfo(logSteps, {
    operation: "prepare-koc",
    runId,
    trigger,
    phase: "google_pool_read_finished",
    message: "Đã đọc Google Pool",
    status: "success",
    details: { poolCount: poolValues.length },
  });

  if (poolValues.length === 0) {
    const preparedAt = new Date().toISOString();
    const job: PreparedAppendJob = {
      status: "skipped",
      reason: "POOL_EMPTY",
      preparedAt,
      expiresAt: createExpiresAt(config.preparedJobMaxAgeSeconds),
    };

    await store.save(job);

    logDevInfo(logSteps, {
      operation: "prepare-koc",
      runId,
      trigger,
      phase: "prepared_job_saved",
      message: "Đã lưu trạng thái Pool rỗng",
      status: "skipped",
      details: { poolCount: 0, durationMs: Date.now() - startedAt },
    });

    return job;
  }

  logDevInfo(logSteps, {
    operation: "prepare-koc",
    runId,
    trigger,
    phase: "lark_column_read_started",
    message: "Bắt đầu đọc cột L trên Lark",
    status: "started",
  });

  const target = await runtimeDependencies.targetSheet.readColumnL();

  logDevInfo(logSteps, {
    operation: "prepare-koc",
    runId,
    trigger,
    phase: "lark_column_read_finished",
    message: "Đã đọc cột L trên Lark",
    status: "success",
    details: { returnedRows: target.values.length, startRow: target.startRow },
  });

  const plan = createAppendPlan(poolValues, target);

  if (plan === null) {
    throw new AutomationError({
      code: "PREPARED_JOB_INVALID",
      provider: "internal",
      operation: "prepare",
    });
  }

  const spreadsheetToken = await runtimeDependencies.getSpreadsheetToken();
  const preparedAt = new Date().toISOString();
  const job: PreparedAppendJob = {
    status: "ready",
    preparedAt,
    expiresAt: createExpiresAt(config.preparedJobMaxAgeSeconds),
    spreadsheetToken,
    targetSheetId: config.larkTargetSheetId,
    values: plan.values,
    startRow: plan.startRow,
    endRow: plan.endRow,
    targetRange: plan.targetRange,
  };

  await store.save(job);

  logDevInfo(logSteps, {
    operation: "prepare-koc",
    runId,
    trigger,
    phase: "prepared_job_saved",
    message: "Đã lưu dữ liệu chuẩn bị",
    status: "success",
    details: {
      poolCount: job.values.length,
      startRow: job.startRow,
      endRow: job.endRow,
      targetRange: job.targetRange,
      durationMs: Date.now() - startedAt,
    },
  });

  return job;
}

export async function runAppendKoc(
  runId: string,
  dependencies?: AppendKocDependencies,
  trigger: AppendTrigger = "manual",
): Promise<JobResult> {
  const startedAt = Date.now();

  if (dependencies === undefined) {
    const config = getAutomationConfig();
    const logSteps = config.dev;
    const store = createPreparedJobStore(config);

    logDevInfo(logSteps, {
      operation: "append-koc",
      runId,
      trigger,
      phase: "prepared_job_read_started",
      message: "Bắt đầu đọc dữ liệu đã chuẩn bị",
      status: "started",
    });

    const preparedJob = await store.read();
    assertPreparedJobIsFresh(preparedJob, config.preparedJobMaxAgeSeconds);

    if (preparedJob.status === "skipped") {
      logDevInfo(logSteps, {
        operation: "append-koc",
        runId,
        trigger,
        phase: "pool_empty",
        message: "Job được bỏ qua vì dữ liệu đã chuẩn bị là Pool rỗng",
        status: "skipped",
        details: { durationMs: Date.now() - startedAt },
      });

      return { status: "skipped", reason: "POOL_EMPTY" };
    }

    if (preparedJob.targetSheetId !== config.larkTargetSheetId) {
      throw new AutomationError({
        code: "PREPARED_JOB_INVALID",
        provider: "redis",
        operation: "read",
      });
    }

    logDevInfo(logSteps, {
      operation: "append-koc",
      runId,
      trigger,
      phase: "prepared_job_read_finished",
      message: "Đã đọc dữ liệu đã chuẩn bị",
      status: "success",
      details: {
        poolCount: preparedJob.values.length,
        startRow: preparedJob.startRow,
        endRow: preparedJob.endRow,
        targetRange: preparedJob.targetRange,
      },
    });

    const larkClient = createLarkClient(config);
    const targetSheet = createLarkTargetSheet(
      {
        larkTargetSheetId: config.larkTargetSheetId,
        getSpreadsheetToken: async () => preparedJob.spreadsheetToken,
      },
      larkClient,
    );

    return writePreparedJob(
      targetSheet,
      preparedJob,
      startedAt,
      runId,
      trigger,
      logSteps,
    );
  }

  const logSteps = process.env.DEV === "true";
  const runtimeDependencies = dependencies;

  logDevInfo(logSteps, {
    operation: "append-koc",
    runId,
    trigger,
    phase: "job_started",
    message: "Bắt đầu job append KOC",
    status: "started",
  });

  logDevInfo(logSteps, {
    operation: "append-koc",
    runId,
    trigger,
    phase: "google_pool_read_started",
    message: "Bắt đầu đọc Google Pool",
    status: "started",
  });

  const poolValues = await runtimeDependencies.poolReader.readValues();

  logDevInfo(logSteps, {
    operation: "append-koc",
    runId,
    trigger,
    phase: "google_pool_read_finished",
    message: "Đã đọc Google Pool",
    status: "success",
    details: { poolCount: poolValues.length },
  });

  if (poolValues.length === 0) {
    const result: JobResult = { status: "skipped", reason: "POOL_EMPTY" };

    logDevInfo(logSteps, {
      operation: "append-koc",
      runId,
      trigger,
      phase: "pool_empty",
      message: "Google Pool đang rỗng",
      status: "skipped",
      details: { poolCount: 0, durationMs: Date.now() - startedAt },
    });

    return result;
  }

  logDevInfo(logSteps, {
    operation: "append-koc",
    runId,
    trigger,
    phase: "lark_column_read_started",
    message: "Bắt đầu đọc cột L trên Lark",
    status: "started",
  });

  const target = await runtimeDependencies.targetSheet.readColumnL();

  logDevInfo(logSteps, {
    operation: "append-koc",
    runId,
    trigger,
    phase: "lark_column_read_finished",
    message: "Đã đọc cột L trên Lark",
    status: "success",
    details: { returnedRows: target.values.length, startRow: target.startRow },
  });

  const plan = createAppendPlan(poolValues, target);

  if (plan === null) {
    const result: JobResult = { status: "skipped", reason: "POOL_EMPTY" };

    logDevInfo(logSteps, {
      operation: "append-koc",
      runId,
      trigger,
      phase: "pool_empty",
      message: "Bộ lập kế hoạch bỏ qua vì Pool rỗng",
      status: "skipped",
      details: { poolCount: 0, durationMs: Date.now() - startedAt },
    });

    return result;
  }

  logDevInfo(logSteps, {
    operation: "append-koc",
    runId,
    trigger,
    phase: "append_plan_created",
    message: "Đã tạo kế hoạch append",
    status: "success",
    details: {
      poolCount: plan.values.length,
      startRow: plan.startRow,
      endRow: plan.endRow,
      targetRange: plan.targetRange,
    },
  });

  logDevInfo(logSteps, {
    operation: "append-koc",
    runId,
    trigger,
    phase: "lark_write_started",
    message: "Bắt đầu ghi vào target sheet",
    status: "started",
    details: { startRow: plan.startRow, endRow: plan.endRow },
  });

  await runtimeDependencies.targetSheet.writeColumnL(
    plan.targetRange,
    plan.values,
  );

  const result: JobResult = {
    status: "success",
    count: plan.values.length,
    startRow: plan.startRow,
    endRow: plan.endRow,
  };

  logRuntimeInfo({
    operation: "append-koc",
    runId,
    trigger,
    phase: "target_sheet_written",
    message: "Đã ghi xong target sheet",
    status: "success",
    details: {
      poolCount: result.count,
      startRow: result.startRow,
      endRow: result.endRow,
      durationMs: Date.now() - startedAt,
    },
  });

  return result;
}
