import type { PaymentPlugin } from "./types";
import { mockPaymentGatewayPlugin } from "./plugins/mockPaymentGateway";

export class PluginRegistry {
  private readonly paymentPlugins = new Map<string, PaymentPlugin>();

  constructor() {
    this.registerPaymentPlugin(mockPaymentGatewayPlugin);
  }

  registerPaymentPlugin(plugin: PaymentPlugin): void {
    this.paymentPlugins.set(plugin.pluginId, plugin);
  }

  listPaymentPlugins(): PaymentPlugin[] {
    return Array.from(this.paymentPlugins.values());
  }

  resolvePaymentPlugin(pluginId: string): PaymentPlugin | undefined {
    return this.paymentPlugins.get(pluginId);
  }
}
