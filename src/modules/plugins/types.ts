import type { RequestContext } from "../../types";

export interface PluginExecutionContext {
  tenantId: string;
  branchId: string;
  userId: string;
  role: RequestContext["role"];
}

export interface PaymentChargeRequest {
  amount: number;
  currency: string;
  orderRef: string;
  method: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentChargeResult {
  status: "APPROVED" | "DECLINED";
  providerRef: string;
  responseCode: string;
  message: string;
}

export interface PaymentPlugin {
  pluginId: string;
  pluginType: "PAYMENT";
  version: string;
  displayName: string;
  description: string;
  charge: (ctx: PluginExecutionContext, payload: PaymentChargeRequest) => PaymentChargeResult;
}
