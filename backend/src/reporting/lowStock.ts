import type { Request, Response } from "express";

export function lowStockReport(_req: Request, res: Response) {
  res.status(200).json({
    generatedAt: new Date().toISOString(),
    items: [],
  });
}
