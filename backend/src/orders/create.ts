import type { Request, Response } from "express";

type Order = {
  id: string;
  status: "OPEN" | "CANCELLED";
  total: number;
};

export const orderStore: Order[] = [];

export function createOrder(req: Request, res: Response) {
  const { total } = req.body ?? {};
  if (typeof total !== "number" || total < 0) {
    res.status(400).json({ code: "INVALID_ORDER_TOTAL" });
    return;
  }

  const order: Order = { id: crypto.randomUUID(), status: "OPEN", total };
  orderStore.push(order);
  res.status(201).json({ item: order });
}
