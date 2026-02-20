import type { ReportId } from "../types";

export const tenantReportIds: ReportId[] = [
  "REP-T-001",
  "REP-T-002",
  "REP-T-003",
  "REP-T-004",
  "REP-T-005",
  "REP-T-006",
  "REP-T-007",
  "REP-T-008",
];

export const ownerReportIds: ReportId[] = [
  "REP-O-001",
  "REP-O-002",
  "REP-O-003",
  "REP-O-004",
  "REP-O-005",
  "REP-O-006",
  "REP-O-007",
  "REP-O-008",
];

export const advancedReportIds: ReportId[] = ["REP-A-001", "REP-A-002", "REP-A-003", "REP-A-004"];

export const allReportIds = [...tenantReportIds, ...ownerReportIds, ...advancedReportIds] as ReportId[];