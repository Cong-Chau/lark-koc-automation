"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RuntimeLogDetails = Record<string, string | number | boolean | null>;

type RuntimeLogEvent = {
  id: string;
  timestamp: string;
  level: "info" | "error";
  operation: "append-koc";
  phase: string;
  message: string;
  runId?: string;
  trigger?: string;
  status?: "started" | "success" | "skipped" | "error";
  details?: RuntimeLogDetails;
};

type RuntimeLogSnapshot = {
  events: RuntimeLogEvent[];
  maxEvents: number;
  retainedEvents: number;
};

type TriggerResponse =
  | { status: "success"; count: number; startRow: number; endRow: number }
  | { status: "skipped"; reason: "POOL_EMPTY" }
  | { status: "error" };

type TriggerResult = {
  tone: "success" | "skipped" | "error";
  message: string;
};

type ExportResult = {
  tone: "success" | "error";
  message: string;
};

const PHASE_LABELS: Record<string, string> = {
  job_started: "Bắt đầu job",
  google_pool_read_started: "Bắt đầu đọc Google Pool",
  google_pool_read_finished: "Đã đọc Google Pool",
  pool_empty: "Google Pool rỗng",
  lark_wiki_resolve_started: "Bắt đầu resolve Lark Wiki node",
  lark_wiki_resolve_finished: "Đã resolve Lark Wiki node",
  lark_column_read_started: "Bắt đầu đọc cột L trên Lark",
  lark_column_read_finished: "Đã đọc cột L trên Lark",
  append_plan_created: "Đã tạo kế hoạch append",
  lark_write_started: "Bắt đầu ghi vào target sheet",
  target_sheet_written: "Đã ghi xong target sheet",
  job_failed: "Job thất bại",
};

const DETAIL_LABELS: Record<string, string> = {
  poolCount: "số dòng Pool",
  durationMs: "thời gian ms",
  returnedRows: "số dòng đọc được",
  startRow: "dòng bắt đầu",
  endRow: "dòng kết thúc",
  targetRange: "range ghi",
  errorCode: "mã lỗi",
  provider: "nguồn",
  operation: "tác vụ",
  requestId: "requestId",
  errorType: "loại lỗi",
};

function getStatusClass(
  status: RuntimeLogEvent["status"],
  level: RuntimeLogEvent["level"],
) {
  if (level === "error" || status === "error") {
    return "border-red-500/30 bg-red-500/10 text-red-200";
  }

  if (status === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }

  if (status === "skipped") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }

  return "border-sky-500/30 bg-sky-500/10 text-sky-200";
}

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(timestamp));
}

function formatStatus(
  status: RuntimeLogEvent["status"],
  level: RuntimeLogEvent["level"],
): string {
  switch (status ?? level) {
    case "started":
      return "Đang chạy";
    case "success":
      return "Thành công";
    case "skipped":
      return "Bỏ qua";
    case "error":
      return "Lỗi";
    case "info":
      return "Thông tin";
    default:
      return status ?? level;
  }
}

function formatTrigger(trigger: string | undefined): string {
  switch (trigger) {
    case "manual":
      return "thủ công";
    case "qstash":
      return "QStash";
    case undefined:
      return "đang chờ";
    default:
      return trigger;
  }
}

function formatPhase(phase: string): string {
  return PHASE_LABELS[phase] ?? phase;
}

function formatDetails(details: RuntimeLogDetails | undefined): string {
  if (!details || Object.keys(details).length === 0) {
    return "";
  }

  return Object.entries(details)
    .map(([key, value]) => `${DETAIL_LABELS[key] ?? key}=${String(value)}`)
    .join("  ");
}

async function fetchRuntimeLogSnapshot(
  limit: number,
): Promise<RuntimeLogSnapshot> {
  const response = await fetch(`/api/logs?limit=${limit}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as RuntimeLogSnapshot;
}

function createExportPayload(snapshot: RuntimeLogSnapshot): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      ...snapshot,
    },
    null,
    2,
  );
}

function createExportFileName(): string {
  return `koc-runtime-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

export function RuntimeLogsPanel() {
  const [snapshot, setSnapshot] = useState<RuntimeLogSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [triggerResult, setTriggerResult] = useState<TriggerResult | null>(
    null,
  );
  const [isTriggering, setIsTriggering] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      const nextSnapshot = await fetchRuntimeLogSnapshot(100);
      setSnapshot(nextSnapshot);
      setError(null);
      setUpdatedAt(formatTime(new Date().toISOString()));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Lỗi không xác định",
      );
    }
  }, []);

  const copyLogs = useCallback(async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      if (!navigator.clipboard) {
        throw new Error("Trình duyệt không hỗ trợ clipboard API.");
      }

      const currentSnapshot = await fetchRuntimeLogSnapshot(200);
      await navigator.clipboard.writeText(createExportPayload(currentSnapshot));
      setSnapshot(currentSnapshot);
      setUpdatedAt(formatTime(new Date().toISOString()));
      setExportResult({
        tone: "success",
        message: `Đã copy ${currentSnapshot.retainedEvents} event log.`,
      });
    } catch (copyError) {
      setExportResult({
        tone: "error",
        message:
          copyError instanceof Error
            ? copyError.message
            : "Không copy được log.",
      });
    } finally {
      setIsExporting(false);
    }
  }, []);

  const downloadLogs = useCallback(async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const currentSnapshot = await fetchRuntimeLogSnapshot(200);
      const blob = new Blob([createExportPayload(currentSnapshot)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = createExportFileName();
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setSnapshot(currentSnapshot);
      setUpdatedAt(formatTime(new Date().toISOString()));
      setExportResult({
        tone: "success",
        message: `Đã tải ${currentSnapshot.retainedEvents} event log.`,
      });
    } catch (downloadError) {
      setExportResult({
        tone: "error",
        message:
          downloadError instanceof Error
            ? downloadError.message
            : "Không tải được log.",
      });
    } finally {
      setIsExporting(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadLogs();
    }, 0);
    const timer = window.setInterval(() => {
      void loadLogs();
    }, 2000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadLogs]);

  const triggerJob = useCallback(async () => {
    const confirmed = window.confirm(
      "Chạy job append ngay bây giờ? Job này có thể ghi dữ liệu thật từ Google Pool vào cột L trên Lark.",
    );

    if (!confirmed) {
      return;
    }

    setIsTriggering(true);
    setTriggerResult(null);

    try {
      const response = await fetch("/api/append-koc", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await response.json()) as TriggerResponse;

      if (!response.ok || body.status === "error") {
        throw new Error(
          `POST /api/append-koc returned HTTP ${response.status}`,
        );
      }

      if (body.status === "success") {
        setTriggerResult({
          tone: "success",
          message: `Đã append ${body.count} dòng vào L${body.startRow}:L${body.endRow}.`,
        });
      } else {
        setTriggerResult({
          tone: "skipped",
          message: "Job được bỏ qua vì Google Pool đang rỗng.",
        });
      }

      await loadLogs();
    } catch (triggerError) {
      setTriggerResult({
        tone: "error",
        message:
          triggerError instanceof Error
            ? triggerError.message
            : "Trigger thủ công thất bại.",
      });
      await loadLogs();
    } finally {
      setIsTriggering(false);
    }
  }, [loadLogs]);

  const latestEvent = snapshot?.events[0];
  const detailRows = useMemo(() => {
    return snapshot?.events ?? [];
  }, [snapshot]);
  const hasLogs = (snapshot?.retainedEvents ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Chạy thủ công
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Chạy cùng job append mà QStash sử dụng. Dùng dòng test trong
              Google Pool khi bạn chỉ muốn kiểm tra kết nối.
            </p>
          </div>
          <button
            className="h-10 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 text-sm font-semibold text-amber-100 transition hover:border-amber-400 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={isTriggering}
            onClick={() => void triggerJob()}
          >
            {isTriggering ? "Đang chạy..." : "Chạy ngay"}
          </button>
        </div>
        {triggerResult ? (
          <div
            className={`mt-3 rounded-md border px-3 py-2 text-sm ${
              triggerResult.tone === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-100"
                : triggerResult.tone === "skipped"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
            }`}
          >
            {triggerResult.message}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Log đang giữ
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-50">
            {snapshot?.retainedEvents ?? 0}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            trên {snapshot?.maxEvents ?? 200}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Trạng thái mới nhất
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-50">
            {latestEvent
              ? formatStatus(latestEvent.status, latestEvent.level)
              : "Đang chờ"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {formatTrigger(latestEvent?.trigger)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Bước mới nhất
          </p>
          <p className="mt-2 truncate text-lg font-semibold text-zinc-50">
            {latestEvent ? formatPhase(latestEvent.phase) : "chưa có event"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {latestEvent ? formatTime(latestEvent.timestamp) : "chưa bắt đầu"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Làm mới
          </p>
          <button
            className="mt-2 h-9 rounded-md border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900"
            type="button"
            onClick={() => void loadLogs()}
          >
            Làm mới ngay
          </button>
          <p className="mt-1 text-xs text-zinc-500">
            {updatedAt ? `Cập nhật lúc ${updatedAt}` : "Đang tự làm mới"}
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          Không tải được log: {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">
            Sự kiện runtime
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="h-8 rounded-md border border-zinc-700 px-3 text-xs font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={!hasLogs || isExporting}
              onClick={() => void copyLogs()}
            >
              Copy log
            </button>
            <button
              className="h-8 rounded-md border border-zinc-700 px-3 text-xs font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={!hasLogs || isExporting}
              onClick={() => void downloadLogs()}
            >
              Tải log
            </button>
            <span className="text-xs text-zinc-500">Mới nhất trước</span>
          </div>
        </div>

        {exportResult ? (
          <div
            className={`border-b px-4 py-2 text-sm ${
              exportResult.tone === "error"
                ? "border-red-500/20 bg-red-500/10 text-red-100"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
            }`}
          >
            {exportResult.message}
          </div>
        ) : null}

        {detailRows.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-zinc-500">
            Chưa có sự kiện runtime.
          </div>
        ) : (
          <div className="divide-y divide-zinc-900">
            {detailRows.map((event) => {
              const details = formatDetails(event.details);

              return (
                <div
                  className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[88px_140px_minmax(0,1fr)]"
                  key={event.id}
                >
                  <div className="font-mono text-xs text-zinc-500">
                    {formatTime(event.timestamp)}
                  </div>
                  <div>
                    <span
                      className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${getStatusClass(
                        event.status,
                        event.level,
                      )}`}
                    >
                      {formatStatus(event.status, event.level)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-zinc-100">
                        {formatPhase(event.phase)}
                      </p>
                      {event.runId ? (
                        <span className="font-mono text-xs text-zinc-500">
                          {event.runId.slice(0, 8)}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-zinc-400">{event.message}</p>
                    {details ? (
                      <p className="mt-2 break-words font-mono text-xs text-zinc-500">
                        {details}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
