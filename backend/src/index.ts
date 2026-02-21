import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { registerAuthRoutes } from "./auth/routes";
import { registerOrderRoutes } from "./orders/routes";
import { registerProductRoutes } from "./products/routes";
import { registerReportingRoutes } from "./reporting/routes";

dotenv.config();

export function createBackendApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "backend", phase: "2" });
  });

  registerAuthRoutes(app);
  registerProductRoutes(app);
  registerOrderRoutes(app);
  registerReportingRoutes(app);

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.BACKEND_PORT ?? 4000);
  createBackendApp().listen(port, () => {
    process.stdout.write(`Backend API listening on ${port}\n`);
  });
}
