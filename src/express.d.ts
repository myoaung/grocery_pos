import type { MemoryStore } from "./store/memoryStore";
import type { RequestContext, RiskDecision } from "./types";

declare global {
  namespace Express {
    interface Request {
      ctx: RequestContext;
      risk: RiskDecision;
      store: MemoryStore;
    }
  }
}

export {};
