import { createGooglePoolReader } from "@/lib/google-sheets";
import { createLarkTargetSheet } from "@/lib/lark-sheets";
import { createAppendPlan } from "@/lib/append-plan";
import { getAutomationConfig } from "@/lib/config";
import type { JobResult, PoolReader, TargetSheet } from "@/types/automation";

export type AppendTrigger = "qstash" | "manual";

export type AppendKocDependencies = {
  poolReader: PoolReader;
  targetSheet: TargetSheet;
};

function createDefaultDependencies(): AppendKocDependencies {
  const config = getAutomationConfig();

  return {
    poolReader: createGooglePoolReader(config),
    targetSheet: createLarkTargetSheet(config),
  };
}

function logResult(
  runId: string,
  trigger: AppendTrigger,
  result: JobResult,
  durationMs: number,
): void {
  console.info(
    JSON.stringify({
      runId,
      operation: "append-koc",
      trigger,
      status: result.status,
      poolCount: result.status === "success" ? result.count : 0,
      ...(result.status === "success"
        ? { startRow: result.startRow, endRow: result.endRow }
        : {}),
      durationMs,
    }),
  );
}

export async function runAppendKoc(
  runId: string,
  dependencies?: AppendKocDependencies,
  trigger: AppendTrigger = "manual",
): Promise<JobResult> {
  const startedAt = Date.now();
  const runtimeDependencies = dependencies ?? createDefaultDependencies();
  const poolValues = await runtimeDependencies.poolReader.readValues();

  if (poolValues.length === 0) {
    const result: JobResult = { status: "skipped", reason: "POOL_EMPTY" };
    logResult(runId, trigger, result, Date.now() - startedAt);
    return result;
  }

  const target = await runtimeDependencies.targetSheet.readColumnL();
  const plan = createAppendPlan(poolValues, target);

  if (plan === null) {
    const result: JobResult = { status: "skipped", reason: "POOL_EMPTY" };
    logResult(runId, trigger, result, Date.now() - startedAt);
    return result;
  }

  await runtimeDependencies.targetSheet.writeColumnL(plan.targetRange, plan.values);

  const result: JobResult = {
    status: "success",
    count: plan.values.length,
    startRow: plan.startRow,
    endRow: plan.endRow,
  };
  logResult(runId, trigger, result, Date.now() - startedAt);
  return result;
}
