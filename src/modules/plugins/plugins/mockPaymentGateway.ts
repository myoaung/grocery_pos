import type { PaymentPlugin } from "../types";

export const mockPaymentGatewayPlugin: PaymentPlugin = {
  pluginId: "mock-gateway-v1",
  pluginType: "PAYMENT",
  version: "1.0.0",
  displayName: "Mock Gateway",
  description: "Sandbox payment plugin for tenant-isolated Phase 2 integrations.",
  charge: (_ctx, payload) => {
    if (payload.amount <= 0) {
      return {
        status: "DECLINED",
        providerRef: "mock-invalid-amount",
        responseCode: "INVALID_AMOUNT",
        message: "Amount must be greater than zero.",
      };
    }

    if (payload.amount > 500000) {
      return {
        status: "DECLINED",
        providerRef: `mock-declined-${Date.now()}`,
        responseCode: "LIMIT_EXCEEDED",
        message: "Sandbox limit exceeded.",
      };
    }

    return {
      status: "APPROVED",
      providerRef: `mock-approved-${Date.now()}`,
      responseCode: "APPROVED",
      message: "Sandbox charge approved.",
    };
  },
};
