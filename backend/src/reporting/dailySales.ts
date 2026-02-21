import type { Request, Response } from "express";

export function dailySalesReport(_req: Request, res: Response) {
  res.status(200).json({
    date: new Date().toISOString().slice(0, 10),
    grossSales: 0,
    receipts: 0,
    currency: "MMK",
  });
}
