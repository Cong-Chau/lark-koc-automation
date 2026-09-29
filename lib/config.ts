import { z } from "zod";

import { AutomationError } from "@/lib/errors";

const runtimeEnvironmentSchema = z.object({
  DEV: z.enum(["true", "false"]).default("false"),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().min(1),
  GOOGLE_POOL_SPREADSHEET_ID: z.string().min(1),
  GOOGLE_POOL_SHEET_NAME: z.string().min(1),
  LARK_APP_ID: z.string().min(1),
  LARK_APP_SECRET: z.string().min(1),
  LARK_DOMAIN: z.string().min(1).default("lark"),
  LARK_WIKI_NODE_TOKEN: z.string().min(1),
  LARK_TARGET_SHEET_ID: z.string().min(1),
});

export type AutomationConfig = {
  dev: boolean;
  googleServiceAccountEmail: string;
  googleServiceAccountPrivateKey: string;
  googlePoolSpreadsheetId: string;
  googlePoolSheetName: string;
  larkAppId: string;
  larkAppSecret: string;
  larkDomain: string;
  larkWikiNodeToken: string;
  larkTargetSheetId: string;
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
  };
}
