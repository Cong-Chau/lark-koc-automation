import type { Client } from "@larksuiteoapi/node-sdk";

import { type AutomationConfig } from "@/lib/config";
import { AutomationError } from "@/lib/errors";

const WIKI_NODE_PATH = "/open-apis/wiki/v2/spaces/get_node";

type LarkApiResponse<T> = {
  code: number;
  msg?: string;
  data?: T;
};

type LarkWikiNodeData = {
  node?: {
    obj_token?: unknown;
    objToken?: unknown;
    obj_type?: unknown;
    objType?: unknown;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLarkApiResponse<T>(value: unknown): value is LarkApiResponse<T> {
  return isRecord(value) && typeof value.code === "number";
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

function toLarkTransportError(error: unknown): AutomationError {
  const status = getProviderStatus(error);

  return new AutomationError({
    code: status === 401 || status === 403 ? "LARK_AUTH_FAILED" : "LARK_READ_FAILED",
    provider: "lark",
    operation: "read",
    cause: error,
  });
}

function toLarkResponseError(response: LarkApiResponse<unknown>): AutomationError {
  return new AutomationError({
    code: "LARK_READ_FAILED",
    provider: "lark",
    operation: "read",
    cause: { code: response.code },
  });
}

function parseSpreadsheetToken(data: unknown): string {
  if (!isRecord(data) || !isRecord(data.node)) {
    throw new AutomationError({
      code: "PROVIDER_RESPONSE_INVALID",
      provider: "lark",
      operation: "read",
    });
  }

  const objectType = data.node.obj_type ?? data.node.objType;
  const objectToken = data.node.obj_token ?? data.node.objToken;

  if (objectType !== "sheet" || typeof objectToken !== "string" || objectToken === "") {
    throw new AutomationError({
      code: "PROVIDER_RESPONSE_INVALID",
      provider: "lark",
      operation: "read",
    });
  }

  return objectToken;
}

export async function resolveLarkSpreadsheetToken(
  config: AutomationConfig,
  client: Client,
): Promise<string> {
  const query = new URLSearchParams({
    token: config.larkWikiNodeToken,
    obj_type: "wiki",
  });

  try {
    const response = await client.request<LarkApiResponse<LarkWikiNodeData>>({
      method: "GET",
      url: `${WIKI_NODE_PATH}?${query}`,
    });

    if (!isLarkApiResponse<LarkWikiNodeData>(response)) {
      throw new AutomationError({
        code: "PROVIDER_RESPONSE_INVALID",
        provider: "lark",
        operation: "read",
      });
    }

    if (response.code !== 0) {
      throw toLarkResponseError(response);
    }

    return parseSpreadsheetToken(response.data);
  } catch (error) {
    if (error instanceof AutomationError) {
      throw error;
    }

    throw toLarkTransportError(error);
  }
}
