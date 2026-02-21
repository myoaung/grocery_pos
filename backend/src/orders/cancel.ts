import type { Request, Response } from "express";
import { orderStore } from "./create";

export function cancelOrder(req: Request, res: Response) {
  const order = orderStore.find((row) => row.id === req.params.orderId);
  if (!order) {
    res.status(404).json({ code: "ORDER_NOT_FOUND" });
    return;
  }
  order.status = "CANCELLED";
  res.status(200).json({ item: order });
}
