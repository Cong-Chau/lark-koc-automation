import { z } from "zod";

import { AutomationError } from "@/lib/errors";

const runtimeEnvironmentSchema = z
  .object({
    DEV: z.enum(["true", "false"]).default("false"),
    PREPARED_JOB_MAX_AGE_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(600),
    PREPARED_JOB_FILE_PATH: z.string().default(".runtime/prepared-job.json"),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().min(1),
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().min(1),
    GOOGLE_POOL_SPREADSHEET_ID: z.string().min(1),
    GOOGLE_POOL_SHEET_NAME: z.string().min(1),
    LARK_APP_ID: z.string().min(1),
    LARK_APP_SECRET: z.string().min(1),
    LARK_DOMAIN: z.string().min(1).default("lark"),
    LARK_WIKI_NODE_TOKEN: z.string().min(1),
    LARK_TARGET_SHEET_ID: z.string().min(1),
    EMAIL_ENABLED: z.enum(["true", "false"]).default("false"),
    EMAIL_SMTP_HOST: z.string().default("smtp.gmail.com"),
    EMAIL_SMTP_PORT: z.coerce.number().int().positive().default(465),
    EMAIL_SMTP_SECURE: z.enum(["true", "false"]).default("true"),
    EMAIL_SMTP_USER: z.string().default(""),
    EMAIL_SMTP_PASSWORD: z.string().default(""),
    EMAIL_FROM: z.string().default(""),
    EMAIL_TO: z.string().default(""),
  })
  .superRefine((env, context) => {
    if (env.EMAIL_ENABLED !== "true") {
      return;
    }

    const requiredEmailFields = [
      "EMAIL_SMTP_HOST",
      "EMAIL_SMTP_USER",
      "EMAIL_SMTP_PASSWORD",
      "EMAIL_FROM",
      "EMAIL_TO",
    ] as const;

    for (const field of requiredEmailFields) {
      if (env[field].trim().length === 0) {
        context.addIssue({
          code: "custom",
          message: `${field} is required when EMAIL_ENABLED=true`,
          path: [field],
        });
      }
    }

    const recipients = env.EMAIL_TO.split(",")
      .map((recipient) => recipient.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      context.addIssue({
        code: "custom",
        message: "EMAIL_TO must contain at least one recipient",
        path: ["EMAIL_TO"],
      });
    }
  });

export type AutomationConfig = {
  dev: boolean;
  preparedJobMaxAgeSeconds: number;
  preparedJobFilePath: string;
  googleServiceAccountEmail: string;
  googleServiceAccountPrivateKey: string;
  googlePoolSpreadsheetId: string;
  googlePoolSheetName: string;
  larkAppId: string;
  larkAppSecret: string;
  larkDomain: string;
  larkWikiNodeToken: string;
  larkTargetSheetId: string;
  email: {
    enabled: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPassword: string;
    from: string;
    to: string[];
  };
};

export function getAutomationConfig(
  env: NodeJS.ProcessEnv = process.env,
): AutomationConfig {
  const parsed = runtimeEnvironmentSchema.safeParse(env);

  if (!parsed.success) {
    throw new AutomationError({
      code: "CONFIG_INVALID",
      provider: "config",
      operation: "config",
      cause: parsed.error,
    });
  }

  return {
    dev: parsed.data.DEV === "true",
    preparedJobMaxAgeSeconds: parsed.data.PREPARED_JOB_MAX_AGE_SECONDS,
    preparedJobFilePath: parsed.data.PREPARED_JOB_FILE_PATH.trim(),
    googleServiceAccountEmail: parsed.data.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    googleServiceAccountPrivateKey:
      parsed.data.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
    googlePoolSpreadsheetId: parsed.data.GOOGLE_POOL_SPREADSHEET_ID,
    googlePoolSheetName: parsed.data.GOOGLE_POOL_SHEET_NAME,
    larkAppId: parsed.data.LARK_APP_ID,
    larkAppSecret: parsed.data.LARK_APP_SECRET,
    larkDomain: parsed.data.LARK_DOMAIN,
    larkWikiNodeToken: parsed.data.LARK_WIKI_NODE_TOKEN,
    larkTargetSheetId: parsed.data.LARK_TARGET_SHEET_ID,
    email: {
      enabled: parsed.data.EMAIL_ENABLED === "true",
      smtpHost: parsed.data.EMAIL_SMTP_HOST.trim(),
      smtpPort: parsed.data.EMAIL_SMTP_PORT,
      smtpSecure: parsed.data.EMAIL_SMTP_SECURE === "true",
      smtpUser: parsed.data.EMAIL_SMTP_USER.trim(),
      smtpPassword: parsed.data.EMAIL_SMTP_PASSWORD,
      from: parsed.data.EMAIL_FROM.trim(),
      to: parsed.data.EMAIL_TO.split(",")
        .map((recipient) => recipient.trim())
        .filter(Boolean),
    },
  };
}
