import type { Request, Response } from "express";

type InventoryItem = {
  productId: string;
  quantity: number;
};

const inventory: InventoryItem[] = [];

export function getInventory(_req: Request, res: Response) {
  res.status(200).json({ items: inventory });
}

export function adjustInventory(req: Request, res: Response) {
  const { productId, quantity } = req.body ?? {};
  if (!productId || typeof quantity !== "number") {
    res.status(400).json({ code: "INVALID_INVENTORY_PAYLOAD" });
    return;
  }

  const found = inventory.find((row) => row.productId === productId);
  if (found) {
    found.quantity = quantity;
  } else {
    inventory.push({ productId, quantity });
  }

  res.status(200).json({ productId, quantity });
}
