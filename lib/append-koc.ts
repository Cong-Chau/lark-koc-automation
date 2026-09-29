import { createGooglePoolReader } from "@/lib/google-sheets";
import { createLarkClient } from "@/lib/lark-client";
import { createLarkTargetSheet } from "@/lib/lark-sheets";
import { resolveLarkSpreadsheetToken } from "@/lib/lark-wiki";
import { createAppendPlan } from "@/lib/append-plan";
import { getAutomationConfig, type AutomationConfig } from "@/lib/config";
import { logRuntimeInfo } from "@/lib/runtime-log";
import type { JobResult, PoolReader, TargetSheet } from "@/types/automation";

export type AppendTrigger = "qstash" | "manual";

export type AppendKocDependencies = {
  poolReader: PoolReader;
  targetSheet: TargetSheet;
};

function logDevInfo(
  enabled: boolean,
  input: Parameters<typeof logRuntimeInfo>[0],
): void {
  if (enabled) {
    logRuntimeInfo(input);
  }
}

function createDefaultDependencies(
  config: AutomationConfig,
  logSteps: boolean,
  runId: string,
  trigger: AppendTrigger,
): AppendKocDependencies {
  const larkClient = createLarkClient(config);

  return {
    poolReader: createGooglePoolReader(config),
    targetSheet: createLarkTargetSheet(
      {
        larkTargetSheetId: config.larkTargetSheetId,
        getSpreadsheetToken: async () => {
          logDevInfo(logSteps, {
            operation: "append-koc",
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
            operation: "append-koc",
            runId,
            trigger,
            phase: "lark_wiki_resolve_finished",
            message: "Đã resolve Lark Wiki node",
            status: "success",
          });

          return spreadsheetToken;
        },
      },
      larkClient,
    ),
  };
}

export async function runAppendKoc(
  runId: string,
  dependencies?: AppendKocDependencies,
  trigger: AppendTrigger = "manual",
): Promise<JobResult> {
  const startedAt = Date.now();
  let logSteps = process.env.DEV === "true";
  let runtimeDependencies = dependencies;

  if (runtimeDependencies === undefined) {
    const config = getAutomationConfig();
    logSteps = config.dev;
    runtimeDependencies = createDefaultDependencies(
      config,
      logSteps,
      runId,
      trigger,
    );
  }

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
