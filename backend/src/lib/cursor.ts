export type ProductCursor = {
  createdAt: string;
  id: string;
};

export function encodeCursor(cursor: ProductCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(raw: string): ProductCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as ProductCursor;

    if (!parsed.createdAt || !parsed.id) {
      throw new Error("Invalid cursor shape");
    }

    return parsed;
  } catch {
    throw new Error("Invalid cursor");
  }
}
