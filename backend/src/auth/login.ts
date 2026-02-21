import type { Request, Response } from "express";

export function loginHandler(req: Request, res: Response) {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ code: "MISSING_CREDENTIALS" });
    return;
  }

  res.status(200).json({
    accessToken: "demo-access-token",
    refreshToken: "demo-refresh-token",
    user: { email },
  });
}
