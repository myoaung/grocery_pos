import type { Request, Response } from "express";

export function signupHandler(req: Request, res: Response) {
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ code: "INVALID_EMAIL" });
    return;
  }

  res.status(201).json({
    userId: crypto.randomUUID(),
    email,
    status: "PENDING_VERIFICATION",
  });
}
