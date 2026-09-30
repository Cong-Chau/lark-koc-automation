import nodemailer from "nodemailer";

import type { AutomationConfig } from "@/lib/config";
import { getRuntimeLogSnapshot, type RuntimeLogEvent } from "@/lib/runtime-log";
import type { AppendTrigger } from "@/lib/append-koc";
import type { JobResult, PreparedAppendJob } from "@/types/automation";

type SuccessfulJobResult = Extract<JobResult, { status: "success" }>;
type ReadyPreparedJob = Extract<PreparedAppendJob, { status: "ready" }>;

type AppendSuccessEmailInput = {
  config: AutomationConfig;
  runId: string;
  trigger: AppendTrigger;
  result: SuccessfulJobResult;
  preparedJob: ReadyPreparedJob;
  durationMs: number;
};

type EmailContent = {
  html: string;
  text: string;
};

function padNumber(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  const vietnamTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const year = vietnamTime.getUTCFullYear();
  const month = padNumber(vietnamTime.getUTCMonth() + 1);
  const day = padNumber(vietnamTime.getUTCDate());
  const hour = padNumber(vietnamTime.getUTCHours());
  const minute = padNumber(vietnamTime.getUTCMinutes());
  const second = padNumber(vietnamTime.getUTCSeconds());
  const millisecond = padNumber(vietnamTime.getUTCMilliseconds(), 3);

  return `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond} GMT+7`;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDetails(event: RuntimeLogEvent): string {
  if (!event.details || Object.keys(event.details).length === 0) {
    return "";
  }

  return Object.entries(event.details)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(", ");
}

function formatStatus(status: RuntimeLogEvent["status"]): string {
  switch (status) {
    case "started":
      return "đang chạy";
    case "success":
      return "thành công";
    case "skipped":
      return "bỏ qua";
    case "error":
      return "lỗi";
    case undefined:
      return "";
    default:
      return status;
  }
}

function getLevelBadgeStyle(event: RuntimeLogEvent): string {
  if (event.level === "error" || event.status === "error") {
    return "background:#fee2e2;color:#991b1b;";
  }

  if (event.status === "success") {
    return "background:#dcfce7;color:#166534;";
  }

  if (event.status === "skipped") {
    return "background:#fef3c7;color:#92400e;";
  }

  return "background:#dbeafe;color:#1d4ed8;";
}

function formatRuntimeLogText(events: RuntimeLogEvent[]): string {
  return events
    .slice()
    .reverse()
    .map((event) => {
      const status = event.status ? ` ${formatStatus(event.status)}` : "";
      const trigger = event.trigger ? ` ${event.trigger}` : "";
      const details = formatDetails(event);

      return [
        `[${formatTimestamp(event.timestamp)}]`,
        event.level.toUpperCase(),
        event.operation,
        event.phase,
        status,
        trigger,
        `- ${event.message}`,
        details ? ` ${details}` : "",
      ]
        .filter(Boolean)
        .join(" ");
    })
    .join("\n");
}

function createEmailSubject(result: SuccessfulJobResult): string {
  return `[Lark KOC] Ghi thành công ${result.count} dòng vào L${result.startRow}:L${result.endRow}`;
}

function createRuntimeLogRows(events: RuntimeLogEvent[]): string {
  return events
    .slice()
    .reverse()
    .map((event) => {
      const details = formatDetails(event);
      const status = formatStatus(event.status);

      return `
        <tr>
          <td style="padding:10px;border:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(
            formatTimestamp(event.timestamp),
          )}</td>
          <td style="padding:10px;border:1px solid #e5e7eb;">
            <span style="display:inline-block;padding:3px 8px;border-radius:999px;font-weight:700;${getLevelBadgeStyle(
              event,
            )}">${escapeHtml(event.level.toUpperCase())}</span>
          </td>
          <td style="padding:10px;border:1px solid #e5e7eb;font-family:Consolas,'Courier New',monospace;">${escapeHtml(
            event.phase,
          )}</td>
          <td style="padding:10px;border:1px solid #e5e7eb;">${escapeHtml(
            status,
          )}</td>
          <td style="padding:10px;border:1px solid #e5e7eb;">${escapeHtml(
            event.message,
          )}</td>
          <td style="padding:10px;border:1px solid #e5e7eb;font-family:Consolas,'Courier New',monospace;color:#374151;">${escapeHtml(
            details,
          )}</td>
        </tr>
      `;
    })
    .join("");
}

function createEmailHtml(
  input: AppendSuccessEmailInput,
  events: RuntimeLogEvent[],
  exportedAt: string,
): string {
  return `<!doctype html>
<html lang="vi">
  <body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:920px;margin:0 auto;padding:28px 18px;">
      <div style="overflow:hidden;border:1px solid #e5e7eb;border-radius:12px;background:#ffffff;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
        <div style="background:#0f172a;color:#ffffff;padding:22px 26px;">
          <div style="font-size:13px;color:#93c5fd;font-weight:700;">Lark KOC Automation</div>
          <h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;">Đã ghi dữ liệu KOC thành công</h1>
          <p style="margin:8px 0 0;color:#cbd5e1;font-size:13px;">Xuất log lúc ${escapeHtml(
            formatTimestamp(exportedAt),
          )}</p>
        </div>

        <div style="padding:24px 26px;">
          <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:22px;">
            <tr>
              <td style="width:25%;padding:14px;border:1px solid #e5e7eb;border-radius:8px 0 0 8px;">
                <div style="font-size:12px;color:#6b7280;">Số dòng ghi</div>
                <div style="margin-top:4px;font-size:24px;font-weight:700;">${escapeHtml(
                  input.result.count,
                )}</div>
              </td>
              <td style="width:40%;padding:14px;border:1px solid #e5e7eb;">
                <div style="font-size:12px;color:#6b7280;">Range ghi</div>
                <div style="margin-top:6px;font:700 14px Consolas,'Courier New',monospace;word-break:break-all;">${escapeHtml(
                  input.preparedJob.targetRange,
                )}</div>
              </td>
              <td style="width:20%;padding:14px;border:1px solid #e5e7eb;">
                <div style="font-size:12px;color:#6b7280;">Thời gian chạy</div>
                <div style="margin-top:6px;font-size:16px;font-weight:700;">${escapeHtml(
                  input.durationMs,
                )} ms</div>
              </td>
              <td style="width:15%;padding:14px;border:1px solid #e5e7eb;border-radius:0 8px 8px 0;">
                <div style="font-size:12px;color:#6b7280;">Trigger</div>
                <div style="margin-top:6px;font-size:16px;font-weight:700;">${escapeHtml(
                  input.trigger,
                )}</div>
              </td>
            </tr>
          </table>

          <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;">
            <tr>
              <td style="width:130px;padding:8px 0;color:#6b7280;">Run ID</td>
              <td style="padding:8px 0;font-family:Consolas,'Courier New',monospace;color:#111827;">${escapeHtml(
                input.runId,
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;">Chuẩn bị lúc</td>
              <td style="padding:8px 0;color:#111827;">${escapeHtml(
                formatTimestamp(input.preparedJob.preparedAt),
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;">Hết hạn lúc</td>
              <td style="padding:8px 0;color:#111827;">${escapeHtml(
                formatTimestamp(input.preparedJob.expiresAt),
              )}</td>
            </tr>
          </table>

          <h2 style="margin:0 0 12px;color:#111827;font-size:17px;line-height:1.3;">Runtime logs</h2>

          <table style="width:100%;border-collapse:collapse;font-size:13px;line-height:1.45;">
            <thead>
              <tr style="background:#f3f4f6;color:#374151;">
                <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">Thời gian</th>
                <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">Mức</th>
                <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">Bước</th>
                <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">Trạng thái</th>
                <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">Nội dung</th>
                <th style="padding:10px;border:1px solid #e5e7eb;text-align:left;">Chi tiết</th>
              </tr>
            </thead>
            <tbody>${createRuntimeLogRows(events)}</tbody>
          </table>

          <p style="margin:20px 0 0;color:#6b7280;font-size:12px;">
            Email này được tạo tự động bởi lark-koc-automation. Nếu cần kiểm tra thêm, mở dashboard runtime trên EC2.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function createEmailText(
  input: AppendSuccessEmailInput,
  events: RuntimeLogEvent[],
  snapshot: ReturnType<typeof getRuntimeLogSnapshot>,
  exportedAt: string,
): string {
  return [
    "Lark KOC đã ghi dữ liệu thành công.",
    "",
    `Run ID: ${input.runId}`,
    `Trigger: ${input.trigger}`,
    `Chuẩn bị lúc: ${formatTimestamp(input.preparedJob.preparedAt)}`,
    `Hết hạn lúc: ${formatTimestamp(input.preparedJob.expiresAt)}`,
    `Range ghi: ${input.preparedJob.targetRange}`,
    `Số dòng ghi: ${input.result.count}`,
    `Dòng bắt đầu: ${input.result.startRow}`,
    `Dòng kết thúc: ${input.result.endRow}`,
    `Thời gian chạy: ${input.durationMs} ms`,
    `Xuất log lúc: ${formatTimestamp(exportedAt)}`,
    "",
    "Runtime logs:",
    formatRuntimeLogText(events),
    "",
    "JSON snapshot:",
    JSON.stringify({ exportedAt, ...snapshot }, null, 2),
  ].join("\n");
}

function createEmailContent(input: AppendSuccessEmailInput): EmailContent {
  const snapshot = getRuntimeLogSnapshot(200);
  const exportedAt = new Date().toISOString();

  return {
    html: createEmailHtml(input, snapshot.events, exportedAt),
    text: createEmailText(input, snapshot.events, snapshot, exportedAt),
  };
}

export async function sendAppendSuccessEmail(
  input: AppendSuccessEmailInput,
): Promise<void> {
  if (!input.config.email.enabled) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: input.config.email.smtpHost,
    port: input.config.email.smtpPort,
    secure: input.config.email.smtpSecure,
    auth: {
      user: input.config.email.smtpUser,
      pass: input.config.email.smtpPassword,
    },
  });

  const emailContent = createEmailContent(input);

  await transporter.sendMail({
    from: input.config.email.from,
    to: input.config.email.to,
    subject: createEmailSubject(input.result),
    text: emailContent.text,
    html: emailContent.html,
  });
}
