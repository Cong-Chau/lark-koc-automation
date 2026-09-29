import type { Client } from "@larksuiteoapi/node-sdk";

import { AutomationError } from "@/lib/errors";
import type {
  LarkColumnRead,
  PoolCellValue,
  TargetSheet,
} from "@/types/automation";

const VALUES_PATH = "/open-apis/sheets/v2/spreadsheets";
const SHEETS_QUERY_PATH = "/open-apis/sheets/v3/spreadsheets";

type LarkApiResponse<T> = {
  code: number;
  msg?: string;
  data?: T;
};

type LarkValueRangeData = {
  valueRange?: {
    range?: unknown;
    values?: unknown;
  };
};

type LarkSheetQueryData = {
  sheets?: unknown;
  items?: unknown;
};

type LarkWriteData = {
  updatedRange?: unknown;
  updatedRows?: unknown;
  updatedColumns?: unknown;
  updatedCells?: unknown;
};

type LarkTargetSheetConfig = {
  larkTargetSheetId: string;
  getSpreadsheetToken: () => Promise<string>;
};

class OpenEndedRangeRejected extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function getProviderStatus(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const response = isRecord(error.response) ? error.response : undefined;
  const responseStatus = response?.status;

  if (typeof responseStatus === "number") {
    return responseStatus;
  }

  return typeof error.code === "number" ? error.code : undefined;
}

function toLarkTransportError(
  error: unknown,
  operation: "read" | "write",
): AutomationError {
  const status = getProviderStatus(error);
  const code =
    status === 401 || status === 403
      ? "LARK_AUTH_FAILED"
      : operation === "write"
        ? "LARK_WRITE_FAILED"
        : "LARK_READ_FAILED";

  return new AutomationError({
    code,
    provider: "lark",
    operation,
    cause: error,
  });
}

function toLarkResponseError(
  response: LarkApiResponse<unknown>,
  operation: "read" | "write",
): AutomationError {
  return new AutomationError({
    code: operation === "write" ? "LARK_WRITE_FAILED" : "LARK_READ_FAILED",
    provider: "lark",
    operation,
    cause: { code: response.code },
  });
}

function isRangeRejection(response: LarkApiResponse<unknown>): boolean {
  const message = response.msg?.toLowerCase() ?? "";

  return (
    message.includes("range") ||
    message.includes("a1") ||
    message.includes("open-ended") ||
    message.includes("invalid")
  );
}

function isLarkApiResponse<T>(value: unknown): value is LarkApiResponse<T> {
  return isRecord(value) && typeof value.code === "number";
}

async function requestJson<T>(
  client: Client,
  request: { method: "GET" | "PUT"; url: string; data?: unknown },
  operation: "read" | "write",
): Promise<LarkApiResponse<T>> {
  try {
    const response = await client.request<LarkApiResponse<T>>({
      method: request.method,
      url: request.url,
      ...(request.data === undefined ? {} : { data: request.data }),
    });

    if (!isLarkApiResponse<T>(response)) {
      throw new AutomationError({
        code: "PROVIDER_RESPONSE_INVALID",
        provider: "lark",
        operation,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof AutomationError) {
      throw error;
    }

    throw toLarkTransportError(error, operation);
  }
}

function parseColumnLRange(
  range: string,
  expectedSheetId: string,
  bounded: boolean,
): number {
  const separatorIndex = range.indexOf("!");
  const sheetId = separatorIndex === -1 ? "" : range.slice(0, separatorIndex);
  const a1Range = separatorIndex === -1 ? "" : range.slice(separatorIndex + 1);

  if (sheetId !== expectedSheetId) {
    throw new AutomationError({
      code: "TARGET_RANGE_INVALID",
      provider: "lark",
      operation: "read",
    });
  }

  const pattern = bounded ? /^L(\d+):L(\d+)$/i : /^L(\d+)(?::L\d*)?$/i;
  const match = pattern.exec(a1Range);

  if (!match) {
    throw new AutomationError({
      code: "TARGET_RANGE_INVALID",
      provider: "lark",
      operation: bounded ? "write" : "read",
    });
  }

  const startRow = Number(match[1]);
  const endRow = bounded ? Number(match[2]) : undefined;

  if (
    !Number.isInteger(startRow) ||
    startRow < 1 ||
    (endRow !== undefined &&
      (!Number.isInteger(endRow) || endRow < startRow))
  ) {
    throw new AutomationError({
      code: "TARGET_RANGE_INVALID",
      provider: "lark",
      operation: bounded ? "write" : "read",
    });
  }

  return startRow;
}

function parseValues(values: unknown): unknown[][] {
  if (values === undefined) {
    return [];
  }

  if (!Array.isArray(values) || values.some((row) => !Array.isArray(row))) {
    throw new AutomationError({
      code: "PROVIDER_RESPONSE_INVALID",
      provider: "lark",
      operation: "read",
    });
  }

  return values;
}

function parseRowCount(data: unknown, sheetId: string): number {
  if (!isRecord(data)) {
    throw new AutomationError({
      code: "PROVIDER_RESPONSE_INVALID",
      provider: "lark",
      operation: "read",
    });
  }

  const candidates = [data.sheets, data.items].find(Array.isArray);

  if (!Array.isArray(candidates)) {
    throw new AutomationError({
      code: "PROVIDER_RESPONSE_INVALID",
      provider: "lark",
      operation: "read",
    });
  }

  const sheet = candidates.find(
    (candidate) =>
      isRecord(candidate) &&
      (candidate.sheet_id === sheetId || candidate.sheetId === sheetId),
  );

  if (!isRecord(sheet)) {
    throw new AutomationError({
      code: "TARGET_RANGE_INVALID",
      provider: "lark",
      operation: "read",
    });
  }

  const gridProperties = isRecord(sheet.grid_properties)
    ? sheet.grid_properties
    : undefined;
  const rowCount = gridProperties?.row_count ?? sheet.row_count;

  if (typeof rowCount !== "number" || !Number.isInteger(rowCount) || rowCount < 1) {
    throw new AutomationError({
      code: "PROVIDER_RESPONSE_INVALID",
      provider: "lark",
      operation: "read",
    });
  }

  return rowCount;
}

function isBoundedColumnLRange(range: string, sheetId: string): boolean {
  try {
    parseColumnLRange(range, sheetId, true);
    return true;
  } catch {
    return false;
  }
}

export function createLarkTargetSheet(
  config: LarkTargetSheetConfig,
  client: Client,
): TargetSheet {
  const openEndedRange = `${config.larkTargetSheetId}!L1:L`;
  let spreadsheetTokenPromise: Promise<string> | undefined;

  function getSpreadsheetToken(): Promise<string> {
    spreadsheetTokenPromise ??= config.getSpreadsheetToken();
    return spreadsheetTokenPromise;
  }

  async function readRowCount(): Promise<number> {
    const spreadsheetToken = await getSpreadsheetToken();
    const response = await requestJson<LarkSheetQueryData>(
      client,
      {
        method: "GET",
        url: `${SHEETS_QUERY_PATH}/${encodePathSegment(spreadsheetToken)}/sheets/query`,
      },
      "read",
    );

    if (response.code !== 0) {
      throw toLarkResponseError(response, "read");
    }

    return parseRowCount(response.data, config.larkTargetSheetId);
  }

  async function readRange(range: string): Promise<LarkColumnRead> {
    const spreadsheetToken = await getSpreadsheetToken();
    const response = await requestJson<LarkValueRangeData>(
      client,
      {
        method: "GET",
        url: `${VALUES_PATH}/${encodePathSegment(spreadsheetToken)}/values/${encodePathSegment(range)}`,
      },
      "read",
    );

    if (response.code !== 0) {
      if (range === openEndedRange && isRangeRejection(response)) {
        throw new OpenEndedRangeRejected();
      }

      throw toLarkResponseError(response, "read");
    }

    if (!isRecord(response.data) || !isRecord(response.data.valueRange)) {
      throw new AutomationError({
        code: "PROVIDER_RESPONSE_INVALID",
        provider: "lark",
        operation: "read",
      });
    }

    const returnedRange = response.data.valueRange.range;

    if (typeof returnedRange !== "string") {
      throw new AutomationError({
        code: "PROVIDER_RESPONSE_INVALID",
        provider: "lark",
        operation: "read",
      });
    }

    const startRow = parseColumnLRange(
      returnedRange,
      config.larkTargetSheetId,
      false,
    );

    return {
      sheetId: config.larkTargetSheetId,
      range: returnedRange,
      startRow,
      values: parseValues(response.data.valueRange.values),
    };
  }

  return {
    async readColumnL() {
      let response: LarkColumnRead;

      try {
        response = await readRange(openEndedRange);
      } catch (error) {
        if (!(error instanceof OpenEndedRangeRejected)) {
          throw error;
        }

        const rowCount = await readRowCount();
        response = await readRange(
          `${config.larkTargetSheetId}!L1:L${rowCount}`,
        );
      }

      return response;
    },

    async writeColumnL(range: string, values: PoolCellValue[]) {
      const spreadsheetToken = await getSpreadsheetToken();

      if (!isBoundedColumnLRange(range, config.larkTargetSheetId)) {
        throw new AutomationError({
          code: "TARGET_RANGE_INVALID",
          provider: "lark",
          operation: "write",
        });
      }

      const startRow = parseColumnLRange(range, config.larkTargetSheetId, true);
      const endRow = Number(/:L(\d+)$/i.exec(range)?.[1]);

      if (values.length === 0 || endRow - startRow + 1 !== values.length) {
        throw new AutomationError({
          code: "TARGET_RANGE_INVALID",
          provider: "lark",
          operation: "write",
        });
      }

      const response = await requestJson<LarkWriteData>(
        client,
        {
          method: "PUT",
          url: `${VALUES_PATH}/${encodePathSegment(spreadsheetToken)}/values`,
          data: {
            valueRange: {
              range,
              values: values.map((value) => [value]),
            },
          },
        },
        "write",
      );

      if (response.code !== 0) {
        throw toLarkResponseError(response, "write");
      }

      if (response.data !== undefined && !isRecord(response.data)) {
        throw new AutomationError({
          code: "PROVIDER_RESPONSE_INVALID",
          provider: "lark",
          operation: "write",
        });
      }

      const updatedRange = isRecord(response.data)
        ? response.data.updatedRange
        : undefined;

      if (
        updatedRange !== undefined &&
        (typeof updatedRange !== "string" ||
          !isBoundedColumnLRange(updatedRange, config.larkTargetSheetId) ||
          updatedRange.toUpperCase() !== range.toUpperCase())
      ) {
        throw new AutomationError({
          code: "PROVIDER_RESPONSE_INVALID",
          provider: "lark",
          operation: "write",
        });
      }
    },
  };
}
