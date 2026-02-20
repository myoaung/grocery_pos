import type { NextFunction, Request, Response } from "express";
import type { PermissionAction } from "../config/permissions";
import { canPerform } from "../config/permissions";
import type { RiskDecision, RiskMode } from "../types";
import { readContextFromHeaders } from "../utils/context";

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const explanationMap: Record<
  string,
  {
    explanationCode: string;
    explanationMessage: string;
    severity: "INFO" | "WARN" | "CRITICAL";
  }
> = {
  READ_ONLY_RISK_POLICY: {
    explanationCode: "LOCK-RISK-READONLY-001",
    explanationMessage: "Session is read-only by risk policy. Write actions are disabled.",
    severity: "CRITICAL",
  },
  RISK_POLICY_BLOCKED: {
    explanationCode: "LOCK-RISK-BLOCK-001",
    explanationMessage: "Session is blocked by risk policy. Restricted operations are denied.",
    severity: "CRITICAL",
  },
  READ_ONLY_CONFLICT_FALLBACK: {
    explanationCode: "LOCK-CONFLICT-READONLY-001",
    explanationMessage: "Open conflicts require manager resolution before mutation actions.",
    severity: "WARN",
  },
  FORBIDDEN_ROLE_PERMISSION: {
    explanationCode: "LOCK-RBAC-001",
    explanationMessage: "Your role is not allowed to perform this action.",
    severity: "WARN",
  },
};

function parseFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeRiskMode(raw: string | undefined): RiskMode {
  const normalized = raw?.trim().toUpperCase();
  if (normalized === "WARN" || normalized === "READ_ONLY" || normalized === "BLOCK") {
    return normalized;
  }
  return "ALLOW";
}

function readRiskDecision(req: Request): RiskDecision {
  const mode = normalizeRiskMode(req.header("x-risk-mode") ?? undefined);
  const factors = new Set<string>();

  if (parseFlag(req.header("x-risk-vpn") ?? undefined)) {
    factors.add("VPN_DETECTED");
  }

  if (parseFlag(req.header("x-risk-location-restricted") ?? undefined)) {
    factors.add("RESTRICTED_LOCATION");
  }

  if (parseFlag(req.header("x-risk-device-untrusted") ?? undefined)) {
    factors.add("UNTRUSTED_DEVICE");
  }

  const rawFactorHeader = req.header("x-risk-factors") ?? "";
  rawFactorHeader
    .split(",")
    .map((factor) => factor.trim().toUpperCase())
    .filter((factor) => factor.length > 0)
    .forEach((factor) => factors.add(factor));

  const factorList = Array.from(factors);

  let message = "No elevated risk signals detected.";
  if (mode === "WARN") {
    message = "Risk warning: continue with caution and review session signals.";
  }
  if (mode === "READ_ONLY") {
    message = "Risk policy set this session to read-only; write actions are disabled.";
  }
  if (mode === "BLOCK") {
    message = "Risk policy blocked this session; operations are denied.";
  }

  if (factorList.length > 0 && mode !== "ALLOW") {
    message = `${message} Factors: ${factorList.join(", ")}`;
  }

  return {
    mode,
    factors: factorList,
    source: req.header("x-risk-mode") ? "HEADER_SIMULATION" : "DEFAULT",
    message,
  };
}

function deny(req: Request, res: Response, reason: string, statusCode = 403): void {
  const now = new Date().toISOString();
  const fallback = {
    userId: req.header("x-user-id") ?? "unknown",
    role: (req.header("x-role") as any) ?? "CASHIER",
    tenantId: req.header("x-tenant-id") ?? "unknown",
    branchId: req.header("x-branch-id") ?? "unknown",
  };

  if (req.store) {
    req.store.addAudit({
      tenantId: fallback.tenantId,
      branchId: fallback.branchId,
      actorUserId: fallback.userId,
      roleAtTime: fallback.role,
      endpoint: req.originalUrl,
      method: req.method,
      decision: "DENY",
      reason,
      actionType: "AUTHZ_DENY",
    });
  }

  const explanation = explanationMap[reason];
  res.status(statusCode).json({
    error: reason,
    mode: req.risk?.mode ?? "ALLOW",
    message: req.risk?.message,
    explanationCode: explanation?.explanationCode,
    explanationMessage: explanation?.explanationMessage,
    explanationSeverity: explanation?.severity,
    timestamp: now,
  });
}

export function attachStore() {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.store = req.app.locals.store;
    req.risk = {
      mode: "ALLOW",
      factors: [],
      source: "DEFAULT",
      message: "No elevated risk signals detected.",
    };
    next();
  };
}

export function requireContext() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.ctx = readContextFromHeaders(req);
    } catch {
      deny(req, res, "FORBIDDEN_MISSING_CONTEXT");
      return;
    }

    const user = req.store.findUserByRole(req.ctx.userId, req.ctx.role);
    if (!user) {
      deny(req, res, "FORBIDDEN_USER_CONTEXT_MISMATCH");
      return;
    }

    if (req.ctx.role !== "APPLICATION_OWNER" && user.tenantId !== req.ctx.tenantId) {
      deny(req, res, "FORBIDDEN_TENANT_SCOPE");
      return;
    }

    const branch = req.store.branches.find(
      (item) => item.branchId === req.ctx.branchId && item.tenantId === req.ctx.tenantId,
    );
    if (!branch) {
      deny(req, res, "FORBIDDEN_BRANCH_SCOPE");
      return;
    }

    if (req.ctx.role !== "APPLICATION_OWNER") {
      const allowed = req.store.userHasBranchAccess(req.ctx.userId, req.ctx.tenantId, req.ctx.branchId);
      if (!allowed) {
        deny(req, res, "FORBIDDEN_BRANCH_ACCESS");
        return;
      }
    }

    next();
  };
}

export function requireTenantPathMatch() {
  return (req: Request, res: Response, next: NextFunction) => {
    const tenantId = req.params.tenantId;
    if (!tenantId) {
      next();
      return;
    }

    if (req.ctx.role !== "APPLICATION_OWNER" && tenantId !== req.ctx.tenantId) {
      deny(req, res, "FORBIDDEN_TENANT_MISMATCH");
      return;
    }

    if (req.ctx.role === "APPLICATION_OWNER" && !req.store.branches.some((b) => b.tenantId === tenantId)) {
      deny(req, res, "FORBIDDEN_INVALID_TENANT");
      return;
    }

    next();
  };
}

export function requirePermission(action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!canPerform(req.ctx.role, action)) {
      deny(req, res, "FORBIDDEN_ROLE_PERMISSION");
      return;
    }

    next();
  };
}

export function evaluateRiskPolicy() {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestedDecision = readRiskDecision(req);
    const action = mutationMethods.has(req.method.toUpperCase()) ? "WRITE" : "READ";
    const riskEnforcementEnabled = req.store.getFeatureFlag(req.ctx.tenantId, "risk_enforcement");

    if (!riskEnforcementEnabled) {
      req.risk = {
        mode: "ALLOW",
        factors: requestedDecision.factors,
        source: requestedDecision.source,
        message: "Risk enforcement disabled by tenant feature flag.",
      };
      res.setHeader("x-risk-mode", req.risk.mode);
      req.store.addSecurityEvent({
        tenantId: req.ctx.tenantId,
        branchId: req.ctx.branchId,
        actorUserId: req.ctx.userId,
        roleAtTime: req.ctx.role,
        endpoint: req.originalUrl,
        action,
        category: "RISK_POLICY",
        severity: requestedDecision.factors.length > 0 ? "WARN" : "INFO",
        mode: "ALLOW",
        message: req.risk.message,
        factors: req.risk.factors,
        source: "MIDDLEWARE",
      });
      if (requestedDecision.mode !== "ALLOW" || requestedDecision.factors.length > 0) {
        req.store.addAudit({
          tenantId: req.ctx.tenantId,
          branchId: req.ctx.branchId,
          actorUserId: req.ctx.userId,
          roleAtTime: req.ctx.role,
          endpoint: req.originalUrl,
          method: req.method,
          decision: "ALLOW",
          reason: "RISK_ENFORCEMENT_DISABLED_BY_FLAG",
          actionType: "RISK_POLICY_BYPASS",
        });
      }
      next();
      return;
    }

    req.risk = requestedDecision;
    res.setHeader("x-risk-mode", req.risk.mode);

    if (req.risk.mode === "ALLOW") {
      if (req.risk.factors.length > 0) {
        req.store.addSecurityEvent({
          tenantId: req.ctx.tenantId,
          branchId: req.ctx.branchId,
          actorUserId: req.ctx.userId,
          roleAtTime: req.ctx.role,
          endpoint: req.originalUrl,
          action,
          category: "RISK_POLICY",
          severity: "WARN",
          mode: "ALLOW",
          message: "Risk factors present without policy escalation.",
          factors: req.risk.factors,
          source: "MIDDLEWARE",
        });
      }
      next();
      return;
    }

    const factorSuffix = req.risk.factors.length > 0 ? `; factors=${req.risk.factors.join(",")}` : "";

    if (req.risk.mode === "WARN") {
      req.store.addSecurityEvent({
        tenantId: req.ctx.tenantId,
        branchId: req.ctx.branchId,
        actorUserId: req.ctx.userId,
        roleAtTime: req.ctx.role,
        endpoint: req.originalUrl,
        action,
        category: "RISK_POLICY",
        severity: "WARN",
        mode: "WARN",
        message: req.risk.message,
        factors: req.risk.factors,
        source: "MIDDLEWARE",
      });
      req.store.events.emit("riskMode", {
        tenantId: req.ctx.tenantId,
        branchId: req.ctx.branchId,
        mode: "WARN",
        message: req.risk.message,
        userId: req.ctx.userId,
        role: req.ctx.role,
      });
      req.store.addAudit({
        tenantId: req.ctx.tenantId,
        branchId: req.ctx.branchId,
        actorUserId: req.ctx.userId,
        roleAtTime: req.ctx.role,
        endpoint: req.originalUrl,
        method: req.method,
        decision: "ALLOW",
        reason: `RISK_MODE=WARN${factorSuffix}`,
        actionType: "RISK_POLICY_WARN",
      });
      res.setHeader("x-risk-alert", req.risk.message);
      next();
      return;
    }

    if (req.risk.mode === "READ_ONLY") {
      req.store.addSecurityEvent({
        tenantId: req.ctx.tenantId,
        branchId: req.ctx.branchId,
        actorUserId: req.ctx.userId,
        roleAtTime: req.ctx.role,
        endpoint: req.originalUrl,
        action,
        category: "RISK_POLICY",
        severity: "CRITICAL",
        mode: "READ_ONLY",
        message: req.risk.message,
        factors: req.risk.factors,
        source: "MIDDLEWARE",
      });
      req.store.events.emit("riskMode", {
        tenantId: req.ctx.tenantId,
        branchId: req.ctx.branchId,
        mode: "READ_ONLY",
        message: req.risk.message,
        userId: req.ctx.userId,
        role: req.ctx.role,
      });
      if (!mutationMethods.has(req.method.toUpperCase())) {
        req.store.addAudit({
          tenantId: req.ctx.tenantId,
          branchId: req.ctx.branchId,
          actorUserId: req.ctx.userId,
          roleAtTime: req.ctx.role,
          endpoint: req.originalUrl,
          method: req.method,
          decision: "ALLOW",
          reason: `RISK_MODE=READ_ONLY${factorSuffix}`,
          actionType: "RISK_POLICY_READ_ONLY",
        });
        res.setHeader("x-risk-alert", req.risk.message);
        next();
        return;
      }

      req.store.addAudit({
        tenantId: req.ctx.tenantId,
        branchId: req.ctx.branchId,
        actorUserId: req.ctx.userId,
        roleAtTime: req.ctx.role,
        endpoint: req.originalUrl,
        method: req.method,
        decision: "DENY",
        reason: `RISK_MODE=READ_ONLY_WRITE_BLOCK${factorSuffix}`,
        actionType: "RISK_POLICY_DENY",
      });
      deny(req, res, "READ_ONLY_RISK_POLICY", 409);
      return;
    }

    const exemptForBlock =
      req.path === "/api/v1/auth/me" || req.path === "/api/v1/risk/sessions" || req.path.startsWith("/api/v1/config/brand/");

    if (exemptForBlock) {
      req.store.addSecurityEvent({
        tenantId: req.ctx.tenantId,
        branchId: req.ctx.branchId,
        actorUserId: req.ctx.userId,
        roleAtTime: req.ctx.role,
        endpoint: req.originalUrl,
        action,
        category: "RISK_POLICY",
        severity: "CRITICAL",
        mode: "BLOCK",
        message: req.risk.message,
        factors: req.risk.factors,
        source: "MIDDLEWARE",
      });
      req.store.addAudit({
        tenantId: req.ctx.tenantId,
        branchId: req.ctx.branchId,
        actorUserId: req.ctx.userId,
        roleAtTime: req.ctx.role,
        endpoint: req.originalUrl,
        method: req.method,
        decision: "ALLOW",
        reason: `RISK_MODE=BLOCK_EXEMPT${factorSuffix}`,
        actionType: "RISK_POLICY_BLOCK_EXEMPT",
      });
      res.setHeader("x-risk-alert", req.risk.message);
      next();
      return;
    }

    req.store.addSecurityEvent({
      tenantId: req.ctx.tenantId,
      branchId: req.ctx.branchId,
      actorUserId: req.ctx.userId,
      roleAtTime: req.ctx.role,
      endpoint: req.originalUrl,
      action,
      category: "RISK_POLICY",
      severity: "CRITICAL",
      mode: "BLOCK",
      message: req.risk.message,
      factors: req.risk.factors,
      source: "MIDDLEWARE",
    });
    req.store.addAudit({
      tenantId: req.ctx.tenantId,
      branchId: req.ctx.branchId,
      actorUserId: req.ctx.userId,
      roleAtTime: req.ctx.role,
      endpoint: req.originalUrl,
      method: req.method,
      decision: "DENY",
      reason: `RISK_MODE=BLOCK${factorSuffix}`,
      actionType: "RISK_POLICY_DENY",
    });
    req.store.events.emit("riskMode", {
      tenantId: req.ctx.tenantId,
      branchId: req.ctx.branchId,
      mode: "BLOCK",
      message: req.risk.message,
      userId: req.ctx.userId,
      role: req.ctx.role,
    });
    deny(req, res, "RISK_POLICY_BLOCKED", 403);
  };
}

export function enforceReadOnlyFallback() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!["CASHIER", "INVENTORY_STAFF"].includes(req.ctx.role)) {
      next();
      return;
    }

    if (!req.store.hasOpenConflicts(req.ctx.tenantId, req.ctx.branchId)) {
      next();
      return;
    }

    deny(req, res, "READ_ONLY_CONFLICT_FALLBACK", 409);
  };
}
