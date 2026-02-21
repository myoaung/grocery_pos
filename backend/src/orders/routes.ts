import type { Express } from "express";
import { cancelOrder } from "./cancel";
import { createOrder } from "./create";
import { getOrder, listOrders } from "./read";
import { updateOrder } from "./update";

export function registerOrderRoutes(app: Express) {
  app.get("/api/orders", listOrders);
  app.get("/api/orders/:orderId", getOrder);
  app.post("/api/orders", createOrder);
  app.patch("/api/orders/:orderId", updateOrder);
  app.post("/api/orders/:orderId/cancel", cancelOrder);
}
