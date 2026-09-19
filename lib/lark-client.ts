import { AppType, Client, Domain } from "@larksuiteoapi/node-sdk";

import { type AutomationConfig } from "@/lib/config";
import { AutomationError } from "@/lib/errors";

export function createLarkClient(config: AutomationConfig): Client {
  try {
    const domain =
      config.larkDomain.toLowerCase() === "lark" ? Domain.Lark : config.larkDomain;

    return new Client({
      appId: config.larkAppId,
      appSecret: config.larkAppSecret,
      appType: AppType.SelfBuild,
      domain,
    });
  } catch (error) {
    throw new AutomationError({
      code: "LARK_AUTH_FAILED",
      provider: "lark",
      operation: "create",
      cause: error,
    });
  }
}
