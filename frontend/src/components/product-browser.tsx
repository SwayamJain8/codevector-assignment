"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchCategories, fetchProducts, type Product } from "@/lib/api";
import { ChevronLeft, ChevronRight, LayoutList, ScrollText } from "lucide-react";

const PAGE_SIZE = 20;

type ViewMode = "scroll" | "pagination";

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ProductBrowser() {
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("pagination");
  const [products, setProducts] = useState<Product[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const categoryParam = useCallback(
    (category: string) => (category === "all" ? undefined : category),
    [],
  );

  const fetchPage = useCallback(
    async (category: string, cursor?: string | null) => {
      return fetchProducts({
        limit: PAGE_SIZE,
        category: categoryParam(category),
        cursor,
      });
    },
    [categoryParam],
  );

  const resetListState = useCallback(() => {
    setProducts([]);
    setNextCursor(null);
    setHasMore(false);
    setPageIndex(0);
    setCursorStack([null]);
  }, []);

  const loadInitial = useCallback(
    async (category: string, mode: ViewMode) => {
      const response = await fetchPage(category, null);
      setProducts(response.products);
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);

      if (mode === "pagination") {
        setPageIndex(0);
        setCursorStack(
          response.nextCursor ? [null, response.nextCursor] : [null],
        );
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      try {
        const categoryResponse = await fetchCategories();
        if (!cancelled) {
          setCategories(categoryResponse.categories);
        }
        await loadInitial("all", viewMode);
      } catch {
        if (!cancelled) {
          setError("Could not load products. Is the API running?");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMoreScroll = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);

    try {
      const response = await fetchPage(selectedCategory, nextCursor);
      setProducts((current) => [...current, ...response.products]);
      setNextCursor(response.nextCursor);
      setHasMore(response.hasMore);
    } catch {
      setError("Failed to load more products.");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchPage, nextCursor, selectedCategory]);

  const goToPage = useCallback(
    async (targetIndex: number) => {
      if (targetIndex < 0) {
        return;
      }

      setLoadingMore(true);
      setError(null);

      try {
        const cursor = cursorStack[targetIndex] ?? null;
        const response = await fetchPage(selectedCategory, cursor);

        setProducts(response.products);
        setHasMore(response.hasMore);
        setPageIndex(targetIndex);

        if (response.nextCursor) {
          setCursorStack((current) => {
            const updated = [...current];
            if (updated.length <= targetIndex + 1) {
              updated[targetIndex + 1] = response.nextCursor;
            }
            return updated;
          });
        }
      } catch {
        setError("Failed to load this page.");
      } finally {
        setLoadingMore(false);
      }
    },
    [cursorStack, fetchPage, selectedCategory],
  );

  useEffect(() => {
    if (viewMode !== "scroll") {
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (
          entry?.isIntersecting &&
          hasMore &&
          !loading &&
          !loadingMoreRef.current
        ) {
          void loadMoreScroll();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [viewMode, hasMore, loading, loadMoreScroll, products.length]);

  async function handleCategoryChange(value: string | null) {
    if (!value) {
      return;
    }

    setSelectedCategory(value);
    setLoading(true);
    setError(null);
    resetListState();

    try {
      await loadInitial(value, viewMode);
    } catch {
      setError("Failed to load products for this category.");
    } finally {
      setLoading(false);
    }
  }

  async function handleViewModeChange(mode: ViewMode) {
    if (mode === viewMode) {
      return;
    }

    setViewMode(mode);
    setLoading(true);
    setError(null);
    resetListState();

    try {
      await loadInitial(selectedCategory, mode);
    } catch {
      setError("Failed to switch view mode.");
    } finally {
      setLoading(false);
    }
  }

  const statusLabel =
    viewMode === "scroll"
      ? `Showing ${products.length.toLocaleString()} loaded products`
      : `Page ${pageIndex + 1}${hasMore ? "" : " (last page)"}`;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-8 py-16 sm:px-12">
      <header className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
            Catalog
          </p>
          <h1 className="text-4xl font-light tracking-tight sm:text-5xl">
            Products
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            Browse 200,000 products, newest first, with stable cursor pagination.
          </p>
        </div>

        <div className="inline-flex rounded-xl bg-muted/50 p-1.5 ring-1 ring-border">
          <Button
            type="button"
            size="lg"
            variant={viewMode === "pagination" ? "default" : "ghost"}
            className="gap-2.5 px-5 text-base"
            onClick={() => void handleViewModeChange("pagination")}
          >
            <LayoutList className="size-5" />
            Pagination
          </Button>
          <Button
            type="button"
            size="lg"
            variant={viewMode === "scroll" ? "default" : "ghost"}
            className="gap-2.5 px-5 text-base"
            onClick={() => void handleViewModeChange("scroll")}
          >
            <ScrollText className="size-5" />
            Scroll
          </Button>
        </div>
      </header>

      <Card className="border-0 bg-card/60 ring-1 ring-border [--card-spacing:--spacing(6)] backdrop-blur-sm">
        <CardHeader className="flex flex-col gap-6 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <CardTitle className="text-xl font-medium">All items</CardTitle>
            <CardDescription className="text-base">
              {viewMode === "scroll"
                ? "Scroll to load more automatically."
                : "Use previous and next to move between pages."}
            </CardDescription>
          </div>
          <Select value={selectedCategory} onValueChange={handleCategoryChange}>
            <SelectTrigger className="h-11 w-full px-4 text-base sm:w-[260px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="py-2.5 text-base">
                All categories
              </SelectItem>
              {categories.map((category) => (
                <SelectItem
                  key={category}
                  value={category}
                  className="py-2.5 text-base"
                >
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-6">
          {error ? (
            <p className="rounded-lg bg-destructive/10 px-4 py-3 text-base text-destructive">
              {error}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-xl ring-1 ring-border">
            <Table className="text-base">
              <TableHeader>
                <TableRow className="border-border/60 hover:bg-transparent">
                  <TableHead className="h-14 px-6 text-sm font-medium tracking-wide text-muted-foreground uppercase">
                    Name
                  </TableHead>
                  <TableHead className="h-14 px-6 text-sm font-medium tracking-wide text-muted-foreground uppercase">
                    Category
                  </TableHead>
                  <TableHead className="h-14 px-6 text-sm font-medium tracking-wide text-muted-foreground uppercase">
                    Price
                  </TableHead>
                  <TableHead className="h-14 px-6 text-sm font-medium tracking-wide text-muted-foreground uppercase">
                    Created
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={4}
                      className="h-32 px-6 text-center text-base text-muted-foreground"
                    >
                      Loading products...
                    </TableCell>
                  </TableRow>
                ) : products.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={4}
                      className="h-32 px-6 text-center text-base text-muted-foreground"
                    >
                      No products found.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => (
                    <TableRow
                      key={product.id}
                      className="border-border/40 hover:bg-muted/30"
                    >
                      <TableCell className="px-6 py-5 text-base font-medium">
                        {product.name}
                      </TableCell>
                      <TableCell className="px-6 py-5">
                        <Badge
                          variant="secondary"
                          className="h-7 px-3 text-sm font-normal"
                        >
                          {product.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-6 py-5 font-mono text-base tabular-nums">
                        {formatPrice(product.price)}
                      </TableCell>
                      <TableCell className="px-6 py-5 text-base text-muted-foreground">
                        {formatDate(product.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {viewMode === "scroll" ? (
            <div className="space-y-4">
              <div ref={sentinelRef} className="h-1" aria-hidden />
              <div className="flex items-center justify-between">
                <p className="text-base text-muted-foreground">{statusLabel}</p>
                {loadingMore ? (
                  <p className="text-base text-muted-foreground">
                    Loading more...
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-base text-muted-foreground">{statusLabel}</p>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2 px-5 text-base"
                  disabled={pageIndex === 0 || loadingMore}
                  onClick={() => void goToPage(pageIndex - 1)}
                >
                  <ChevronLeft className="size-5" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="gap-2 px-5 text-base"
                  disabled={!hasMore || loadingMore}
                  onClick={() => void goToPage(pageIndex + 1)}
                >
                  Next
                  <ChevronRight className="size-5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
