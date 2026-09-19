import { google, sheets_v4 } from "googleapis";

import { getAutomationConfig, type AutomationConfig } from "@/lib/config";
import { AutomationError } from "@/lib/errors";
import { filterPoolValues } from "@/lib/append-plan";
import type { PoolReader } from "@/types/automation";

const GOOGLE_SHEETS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets.readonly";

function escapeSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

function getProviderStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const candidate = error as {
    code?: number;
    response?: { status?: number };
  };

  return candidate.response?.status ?? candidate.code;
}

function toGoogleError(error: unknown): AutomationError {
  const status = getProviderStatus(error);
  const code = status === 401 || status === 403 ? "GOOGLE_AUTH_FAILED" : "GOOGLE_READ_FAILED";

  return new AutomationError({
    code,
    provider: "google",
    operation: "read",
    cause: error,
  });
}

function createGoogleSheetsClient(config: AutomationConfig): sheets_v4.Sheets {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: config.googleServiceAccountEmail,
        private_key: config.googleServiceAccountPrivateKey,
      },
      scopes: [GOOGLE_SHEETS_READONLY_SCOPE],
    });

    return google.sheets({ version: "v4", auth });
  } catch (error) {
    throw new AutomationError({
      code: "GOOGLE_AUTH_FAILED",
      provider: "google",
      operation: "create",
      cause: error,
    });
  }
}

export function createGooglePoolReader(
  config: AutomationConfig = getAutomationConfig(),
): PoolReader {
  const sheets = createGoogleSheetsClient(config);
  const range = `${escapeSheetName(config.googlePoolSheetName)}!A2:A`;

  return {
    async readValues() {
      let response: sheets_v4.Schema$ValueRange;

      try {
        const result = await sheets.spreadsheets.values.get({
          spreadsheetId: config.googlePoolSpreadsheetId,
          range,
          majorDimension: "ROWS",
          valueRenderOption: "UNFORMATTED_VALUE",
        });

        response = result.data;
      } catch (error) {
        throw toGoogleError(error);
      }

      const rows = response.values ?? [];

      if (!Array.isArray(rows) || rows.some((row) => !Array.isArray(row))) {
        throw new AutomationError({
          code: "PROVIDER_RESPONSE_INVALID",
          provider: "google",
          operation: "read",
        });
      }

      return filterPoolValues(rows);
    },
  };
}
