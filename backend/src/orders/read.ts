import type { Request, Response } from "express";
import { orderStore } from "./create";

export function listOrders(_req: Request, res: Response) {
  res.status(200).json({ items: orderStore });
}

export function getOrder(req: Request, res: Response) {
  const order = orderStore.find((row) => row.id === req.params.orderId);
  if (!order) {
    res.status(404).json({ code: "ORDER_NOT_FOUND" });
    return;
  }
  res.status(200).json({ item: order });
}
