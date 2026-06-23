export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductsResponse = {
  products: Product[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CategoriesResponse = {
  categories: string[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export async function fetchCategories(): Promise<CategoriesResponse> {
  const response = await fetch(`${API_URL}/api/products/categories`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch categories");
  }

  return response.json();
}

export async function fetchProducts(params: {
  limit?: number;
  category?: string;
  cursor?: string | null;
}): Promise<ProductsResponse> {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? 20));

  if (params.category) {
    search.set("category", params.category);
  }

  if (params.cursor) {
    search.set("cursor", params.cursor);
  }

  const response = await fetch(`${API_URL}/api/products?${search}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch products");
  }

  return response.json();
}
