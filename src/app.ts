import express from "express";
import { assertCoreTypeContractsLocked } from "./config/coreContracts";
import { attachStore, evaluateRiskPolicy, requireContext } from "./middleware/auth";
import { RetentionPurgeScheduler } from "./jobs/retention/retentionPurgeScheduler";
import { createApiRouter } from "./routes/api";
import { AuditService } from "./services/auditService";
import { createStore, type MemoryStore } from "./store/memoryStore";

export function createApp(store: MemoryStore = createStore()) {
  assertCoreTypeContractsLocked();
  new AuditService(store).startupIntegrityCheck();
  new RetentionPurgeScheduler(store).start();
  const app = express();
  app.locals.store = store;

  app.use(express.json({ limit: "1mb" }));
  app.use("/web", express.static("web"));

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/", (_req, res) => {
    res.redirect("/web/");
  });

  app.use(attachStore());
  app.use(requireContext());
  app.use(evaluateRiskPolicy());
  app.use(createApiRouter(store));

  app.use((req, res) => {
    res.status(404).json({ error: "NOT_FOUND", path: req.path });
  });

  return app;
}
