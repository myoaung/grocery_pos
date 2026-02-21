import type { Express } from "express";
import { loginHandler } from "./login";
import { passwordResetHandler } from "./passwordReset";
import { signupHandler } from "./signup";

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/signup", signupHandler);
  app.post("/api/auth/login", loginHandler);
  app.post("/api/auth/password-reset", passwordResetHandler);
}
