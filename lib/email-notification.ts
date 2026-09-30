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

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(timestamp));
}

function formatDetails(event: RuntimeLogEvent): string {
  if (!event.details || Object.keys(event.details).length === 0) {
    return "";
  }

  return ` ${JSON.stringify(event.details)}`;
}

function formatRuntimeLogText(events: RuntimeLogEvent[]): string {
  return events
    .slice()
    .reverse()
    .map((event) => {
      const status = event.status ? ` ${event.status}` : "";
      const trigger = event.trigger ? ` ${event.trigger}` : "";

      return [
        `[${formatTimestamp(event.timestamp)}]`,
        event.level.toUpperCase(),
        event.operation,
        event.phase,
        status,
        trigger,
        `- ${event.message}`,
        formatDetails(event),
      ]
        .filter(Boolean)
        .join(" ");
    })
    .join("\n");
}

function createEmailSubject(result: SuccessfulJobResult): string {
  return `[Lark KOC] Ghi thanh cong ${result.count} dong vao L${result.startRow}:L${result.endRow}`;
}

function createEmailText(input: AppendSuccessEmailInput): string {
  const snapshot = getRuntimeLogSnapshot(200);
  const exportedAt = new Date().toISOString();

  return [
    "Lark KOC append da ghi thanh cong.",
    "",
    `Run ID: ${input.runId}`,
    `Trigger: ${input.trigger}`,
    `Prepared at: ${input.preparedJob.preparedAt}`,
    `Target range: ${input.preparedJob.targetRange}`,
    `Rows: ${input.result.count}`,
    `Start row: ${input.result.startRow}`,
    `End row: ${input.result.endRow}`,
    `Duration ms: ${input.durationMs}`,
    `Exported at: ${exportedAt}`,
    "",
    "Runtime logs:",
    formatRuntimeLogText(snapshot.events),
    "",
    "JSON snapshot:",
    JSON.stringify({ exportedAt, ...snapshot }, null, 2),
  ].join("\n");
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

  await transporter.sendMail({
    from: input.config.email.from,
    to: input.config.email.to,
    subject: createEmailSubject(input.result),
    text: createEmailText(input),
  });
}
