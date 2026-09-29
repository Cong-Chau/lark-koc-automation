import { randomUUID } from "node:crypto";

import { runAppendKoc, type AppendTrigger } from "@/lib/append-koc";
import { toSafeErrorFields } from "@/lib/errors";
import { logRuntimeError } from "@/lib/runtime-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTrigger(request: Request): AppendTrigger {
  return request.headers.has("Upstash-Signature") ? "qstash" : "manual";
}

function methodNotAllowed(): Response {
  return Response.json(
    { status: "error", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}

export async function POST(request: Request): Promise<Response> {
  const runId = randomUUID();
  const trigger = getTrigger(request);
  const startedAt = Date.now();

  try {
    const result = await runAppendKoc(runId, undefined, trigger);
    return Response.json(result, { status: 200 });
  } catch (error) {
    logRuntimeError({
      operation: "append-koc",
      runId,
      trigger,
      phase: "job_failed",
      message: "Job append KOC thất bại",
      status: "error",
      details: {
        durationMs: Date.now() - startedAt,
        ...toSafeErrorFields(error),
      },
    });

    return Response.json({ status: "error" }, { status: 500 });
  }
}

export function GET(): Response {
  return methodNotAllowed();
}

export function PUT(): Response {
  return methodNotAllowed();
}

export function PATCH(): Response {
  return methodNotAllowed();
}

export function DELETE(): Response {
  return methodNotAllowed();
}

export function HEAD(): Response {
  return methodNotAllowed();
}

export function OPTIONS(): Response {
  return methodNotAllowed();
}
