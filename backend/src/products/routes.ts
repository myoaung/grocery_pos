import type { Express } from "express";
import { createProduct, listProducts } from "./crud";
import { adjustInventory, getInventory } from "./inventory";

export function registerProductRoutes(app: Express) {
  app.get("/api/products", listProducts);
  app.post("/api/products", createProduct);
  app.get("/api/products/inventory", getInventory);
  app.patch("/api/products/inventory", adjustInventory);
}
