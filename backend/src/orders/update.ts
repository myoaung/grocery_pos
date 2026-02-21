import type { Request, Response } from "express";
import { orderStore } from "./create";

export function updateOrder(req: Request, res: Response) {
  const order = orderStore.find((row) => row.id === req.params.orderId);
  if (!order) {
    res.status(404).json({ code: "ORDER_NOT_FOUND" });
    return;
  }

  const total = req.body?.total;
  if (typeof total === "number" && total >= 0) {
    order.total = total;
  }

  res.status(200).json({ item: order });
}
