import { createBackendApp } from "../src/index";

describe("backend bootstrap", () => {
  it("creates express app instance", () => {
    const app = createBackendApp();
    expect(app).toBeDefined();
  });
});
