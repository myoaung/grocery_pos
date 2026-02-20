export const phase5MockDataset = {
  tenant: {
    tenantId: "tenant-a",
    branchId: "branch-a-1",
    branchIdAlt: "branch-a-2",
  },
  discounts: {
    couponCode: "WEEKEND5",
    productId: "prod-a-001",
    quantity: 6,
    manualOverridePct: 2,
  },
  loyalty: {
    customerId: "cust-a-1",
    startingPoints: 180,
    accruePoints: 120,
    redeemPoints: 100,
  },
  multiStoreReporting: {
    summaryKey: "summary",
    inventoryRiskKey: "inventory-risk",
    discountComplianceKey: "discount-compliance",
    filters: {
      dateFrom: "2026-02-01",
      dateTo: "2026-02-20",
    },
  },
  riskCompliance: {
    warnPolicy: {
      policyName: "Warn on restricted location",
      scope: "BRANCH",
      mode: "WARN",
      conditions: { restrictedLocation: true },
    },
    readOnlyPolicy: {
      policyName: "Read only on VPN",
      scope: "BRANCH",
      mode: "READ_ONLY",
      conditions: { vpnDetected: true },
    },
    blockPolicy: {
      policyName: "Block on VPN + device",
      scope: "TENANT",
      mode: "BLOCK",
      conditions: { vpnDetected: true, untrustedDevice: true },
    },
  },
};
