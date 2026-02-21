import type { Request, Response } from "express";

type Product = {
  id: string;
  name: string;
  sku: string;
};

const products: Product[] = [];

export function listProducts(_req: Request, res: Response) {
  res.status(200).json({ items: products });
}

export function createProduct(req: Request, res: Response) {
  const { name, sku } = req.body ?? {};
  if (!name || !sku) {
    res.status(400).json({ code: "INVALID_PRODUCT_PAYLOAD" });
    return;
  }

  const product: Product = { id: crypto.randomUUID(), name, sku };
  products.push(product);
  res.status(201).json({ item: product });
}
