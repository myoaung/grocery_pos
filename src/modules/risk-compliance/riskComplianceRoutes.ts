import { Router } from "express";
import { z } from "zod";
import { requirePermission, requireTenantPathMatch } from "../../middleware/auth";
import type { MemoryStore } from "../../store/memoryStore";
import { asServiceError, resolveUserExplanation, ServiceError } from "../../utils/errors";
import { RiskComplianceService } from "./riskComplianceService";

const policySchema = z.object({
  policyId: z.string().optional(),
  branchId: z.string().optional(),
  policyName: z.string().min(1),
  scope: z.enum(["TENANT", "BRANCH"]),
  mode: z.enum(["WARN", "READ_ONLY", "BLOCK"]),
  enabled: z.boolean().optional(),
  conditions: z.object({
    vpnDetected: z.boolean().optional(),
    restrictedLocation: z.boolean().optional(),
    untrustedDevice: z.boolean().optional(),
  }),
});

const evaluateSchema = z.object({
  branchId: z.string().optional(),
  endpoint: z.string().min(1),
  action: z.enum(["READ", "WRITE"]),
  vpnDetected: z.boolean().optional(),
  restrictedLocation: z.boolean().optional(),
  untrustedDevice: z.boolean().optional(),
});

const incidentSimulationSchema = z.object({
  branchId: z.string().optional(),
  endpoint: z.string().min(1),
  summary: z.string().optional(),
});

function withErrorHandling(handler: (req: any, res: any) => Promise<void> | void) {
  return async (req: any, res: any) => {
    try {
      await handler(req, res);
    } catch (error) {
      const serviceError = asServiceError(error);
      const explanation = resolveUserExplanation(serviceError.code);
      res.status(serviceError.statusCode).json({
        error: serviceError.code,
        message: serviceError.message,
        explanationCode: explanation?.explanationCode,
        explanationMessage: explanation?.explanationMessage,
        explanationSeverity: explanation?.explanationSeverity,
      });
    }
  };
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION_ERROR", parsed.error.message, 400);
  }
  return parsed.data;
}

export function createRiskComplianceRouter(store: MemoryStore) {
  const service = new RiskComplianceService(store);
  const router = Router();

  router.get(
    "/api/v1/tenants/:tenantId/risk-compliance/policies",
    requireTenantPathMatch(),
    requirePermission("risk.policy.read"),
    withErrorHandling((req, res) => {
      const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
      res.json({ items: service.listPolicies(req.ctx, req.params.tenantId, branchId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/risk-compliance/policies",
    requireTenantPathMatch(),
    requirePermission("risk.policy.write"),
    withErrorHandling((req, res) => {
      const input = parseBody(policySchema, req.body);
      res.status(201).json({ item: service.upsertPolicy(req.ctx, req.params.tenantId, input) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/risk-compliance/evaluate",
    requireTenantPathMatch(),
    requirePermission("risk.compliance.evaluate"),
    withErrorHandling((req, res) => {
      const input = parseBody(evaluateSchema, req.body);
      const output = service.evaluate(req.ctx, req.params.tenantId, input);
      res.status(output.statusCode).json(output);
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/risk-compliance/events",
    requireTenantPathMatch(),
    requirePermission("risk.compliance.events"),
    withErrorHandling((req, res) => {
      const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
      res.json({ items: service.listEvents(req.ctx, req.params.tenantId, branchId) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/risk-compliance/incidents",
    requireTenantPathMatch(),
    requirePermission("risk.compliance.events"),
    withErrorHandling((req, res) => {
      const incidentId = typeof req.query.incidentId === "string" ? req.query.incidentId : undefined;
      res.json({ items: service.listIncidentLifecycle(req.ctx, req.params.tenantId, incidentId) });
    }),
  );

  router.post(
    "/api/v1/tenants/:tenantId/risk-compliance/incidents/simulate-critical",
    requireTenantPathMatch(),
    requirePermission("risk.policy.write"),
    withErrorHandling((req, res) => {
      const input = parseBody(incidentSimulationSchema, req.body);
      res.status(201).json({ item: service.simulateCriticalIncident(req.ctx, req.params.tenantId, input) });
    }),
  );

  router.get(
    "/api/v1/tenants/:tenantId/risk-compliance/security-events",
    requireTenantPathMatch(),
    requirePermission("risk.security.events"),
    withErrorHandling((req, res) => {
      const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
      let severity: "INFO" | "WARN" | "CRITICAL" | undefined;
      if (typeof req.query.severity === "string") {
        const normalized = req.query.severity.toUpperCase();
        if (!["INFO", "WARN", "CRITICAL"].includes(normalized)) {
          throw new ServiceError("VALIDATION_ERROR", "severity must be INFO, WARN, or CRITICAL", 400);
        }
        severity = normalized as "INFO" | "WARN" | "CRITICAL";
      }
      res.json({
        items: service.listSecurityEvents(req.ctx, req.params.tenantId, branchId, severity),
      });
    }),
  );

  return router;
}
