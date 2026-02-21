import request from "supertest";
import { createBackendApp } from "../../src/index";

describe("backend api contracts", () => {
  it("returns health payload", async () => {
    const app = createBackendApp();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("creates and reads orders", async () => {
    const app = createBackendApp();
    const created = await request(app).post("/api/orders").send({ total: 10 });
    expect(created.status).toBe(201);
    const orderId = created.body.item.id as string;

    const found = await request(app).get(`/api/orders/${orderId}`);
    expect(found.status).toBe(200);
    expect(found.body.item.id).toBe(orderId);
  });
});
