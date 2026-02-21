import type { Express } from "express";
import { dailySalesReport } from "./dailySales";
import { lowStockReport } from "./lowStock";

export function registerReportingRoutes(app: Express) {
  app.get("/api/reporting/daily-sales", dailySalesReport);
  app.get("/api/reporting/low-stock", lowStockReport);
}
