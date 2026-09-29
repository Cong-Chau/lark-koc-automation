import { getRuntimeLogSnapshot } from "@/lib/runtime-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getLimit(request: Request): number {
  const { searchParams } = new URL(request.url);
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit === null ? 100 : Number(rawLimit);

  if (!Number.isFinite(limit)) {
    return 100;
  }

  return limit;
}

export function GET(request: Request): Response {
  return Response.json(getRuntimeLogSnapshot(getLimit(request)), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
