import type { Request, Response } from "express";
import { decodeCursor, encodeCursor } from "../lib/cursor";
import { prisma } from "../lib/db";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

let cachedCategories: string[] | null = null;

export const getCategories = async (_req: Request, res: Response) => {
  try {
    // Only hit the database once; reuse the result after that
    if (!cachedCategories) {
      const rows = await prisma.product.findMany({
        distinct: ["category"],
        select: { category: true },
        orderBy: { category: "asc" },
      });
      cachedCategories = rows.map((row) => row.category);
    }

    res.json({ categories: cachedCategories });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load categories" });
  }
};

export const retrieveProducts = async (req: Request, res: Response) => {
  try {
    // --- Step 1: read query params from the URL ---

    const limit = clampPageSize(req.query.limit);
    const category = readCategory(req.query.category);
    const cursorRaw = readCursor(req.query.cursor);

    // --- Step 2: build the database WHERE clause ---

    const where = buildWhereClause(category, cursorRaw);

    // --- Step 3: query the database ---
    //
    // We fetch limit + 1 rows on purpose:
    //   - if we get 21 rows and limit is 20 → there IS a next page
    //   - if we get ≤ 20 rows → we're on the last page
    //
    // ORDER BY created_at DESC, id DESC = newest first (assignment req #1)
    // The composite index in schema.prisma makes this fast (assignment req #3)

    const rows = await prisma.product.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1, // fetch one extra row to check if there's more
    });

    // --- Step 4: split results into "this page" and "is there more?" ---

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const lastProduct = page.at(-1);

    // --- Step 5: send JSON response ---

    res.json({
      products: page.map(toJson),
      // Client sends this back as ?cursor=... to get the next page
      nextCursor:
        hasMore && lastProduct
          ? encodeCursor({
              createdAt: lastProduct.createdAt.toISOString(),
              id: lastProduct.id,
            })
          : null,
      hasMore,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid cursor") {
      return res.status(400).json({ error: "Invalid cursor" });
    }

    console.error(error);
    res.status(500).json({ error: "Failed to load products" });
  }
};

function clampPageSize(raw: unknown): number {
  const n = Number(raw) || DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(n, 1), MAX_PAGE_SIZE);
}

function readCategory(raw: unknown): string | undefined {
  if (typeof raw === "string" && raw.length > 0) {
    return raw;
  }
  return undefined;
}

function readCursor(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    return raw;
  }
  return undefined;
}

function buildWhereClause(
  category: string | undefined,
  cursorRaw: string | undefined,
) {
  const where: {
    category?: string;
    OR?: Array<
      | { createdAt: { lt: Date } }
      | { AND: [{ createdAt: Date }, { id: { lt: string } }] }
    >;
  } = {};

  if (category) {
    where.category = category;
  }

  if (cursorRaw) {
    const cursor = decodeCursor(cursorRaw);
    const cursorDate = new Date(cursor.createdAt);

    if (Number.isNaN(cursorDate.getTime())) {
      throw new Error("Invalid cursor");
    }

    where.OR = [
      { createdAt: { lt: cursorDate } },
      { AND: [{ createdAt: cursorDate }, { id: { lt: cursor.id } }] },
    ];
  }

  return where;
}

function toJson(product: {
  id: string;
  name: string;
  category: string;
  price: { toNumber: () => number };
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price.toNumber(),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
