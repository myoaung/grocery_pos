import type { Request, Response } from "express";

export function passwordResetHandler(req: Request, res: Response) {
  const { email } = req.body ?? {};
  if (!email) {
    res.status(400).json({ code: "MISSING_EMAIL" });
    return;
  }

  res.status(202).json({
    email,
    status: "RESET_LINK_QUEUED",
  });
}
