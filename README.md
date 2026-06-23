# CodeVector Take-Home — Product Catalog

A small backend + frontend to browse **200,000 products** with fast, stable pagination.

**Live URLs**

- API: `http://<your-ec2-ip>:3000`
- UI: `https://<your-vercel-app>.vercel.app`

---

## 1. The Problem

The assignment asks us to build a product browser where:

- There are **~200,000 products** in the database
- Users see products **newest first**
- Users can **filter by category**
- Users can **paginate** through the list
- Pagination must be **fast** even on large data
- Pagination must stay **correct while data changes** — if 50 new products are added while someone is browsing, they must **not see the same product twice** or **miss any product**

The hard part is not building a basic API. The hard part is choosing the **right pagination approach** that stays fast and correct at scale.

### Why normal pagination fails

A common approach is **offset pagination**:

```sql
SELECT * FROM products ORDER BY created_at DESC LIMIT 20 OFFSET 1000
```

This has two problems:

1. **Slow** — the database must scan and skip 1000 rows every time. Gets worse as you go deeper.
2. **Unstable** — if new products are inserted at the top while you browse, rows shift. Page 2 might repeat items from page 1, or skip some entirely.

---

## 2. The Solution

I used **cursor (keyset) pagination** instead of offset pagination.

### How it works (simple version)

1. Sort all products by **newest first**: `created_at DESC`, then `id DESC` as a tie-breaker
2. Return the first 20 products
3. Remember the **last product** on that page as a **bookmark (cursor)**
4. For the next page, ask: _"Give me 20 products that come **after** this bookmark in our sort order"_
5. The client sends the cursor back as `?cursor=...` in the next request

The cursor is just the `createdAt` + `id` of the last item, encoded as base64.

### Why this solves the assignment

| Problem                      | How cursor pagination fixes it                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slow deep pages              | No `OFFSET`. Database uses an **index** to jump directly to the right rows                                                                                                                |
| Data changing while browsing | New products appear at the **top**. Your cursor points to an **older** position. Forward paging only looks at products **older than the cursor**, so new inserts don't shift your results |

### Tech choices

| Part     | Choice                              | Why                               |
| -------- | ----------------------------------- | --------------------------------- |
| Runtime  | **Bun**                             | Fast, simple tooling              |
| API      | **Express**                         | Lightweight, easy to explain      |
| ORM      | **Prisma**                          | Type-safe queries, clean schema   |
| Database | **PostgreSQL (Neon)**               | Strong indexing, free hosted tier |
| Frontend | **Next.js + Shadcn**                | Simple UI to demo the API (bonus) |
| Deploy   | **AWS EC2** (API) + **Vercel** (UI) | API on EC2, UI on Vercel          |

---

## 3. Execution — How I Built It

### Project structure

```
codevector-assignment/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # table + indexes
│   │   ├── seed.ts            # 200k product generator
│   │   └── migrations/        # SQL to create tables
│   ├── src/
│   │   ├── index.ts           # Express server
│   │   ├── routes/products.ts # main API logic
│   │   └── lib/
│   │       ├── cursor.ts      # encode/decode pagination bookmark
│   │       └── prisma.ts      # database connection
│   └── deploy/
│       └── products-api.service  # systemd unit for EC2
└── frontend/
    └── src/components/product-browser.tsx  # browse UI
```

### Step 1 — Database schema

Each product has: `id`, `name`, `category`, `price`, `created_at`, `updated_at`.

Two indexes were added for speed:

```prisma
@@index([createdAt(sort: Desc), id(sort: Desc)])           // browse all, newest first
@@index([category, createdAt(sort: Desc), id(sort: Desc)]) // filter + browse
```

Without these, sorting 200k rows on every request would be slow.

### Step 2 — Seed script (200k products)

File: [`backend/prisma/seed.ts`](backend/prisma/seed.ts)

- Inserts **200,000 products** in batches of **5,000** using bulk `INSERT` SQL
- **Not** 200k separate `prisma.create()` calls (that would take forever)
- Finishes in ~7 seconds locally, under ~30s on Neon
- Each product gets a unique `id`, staggered `created_at` (1 second apart) so "newest first" is meaningful

### Step 3 — API endpoints

| Endpoint                       | Purpose                           |
| ------------------------------ | --------------------------------- |
| `GET /health`                  | Health check for EC2              |
| `GET /api/products`            | Paginated product list            |
| `GET /api/products/categories` | Category list for filter dropdown |

**`GET /api/products` query params:**

- `limit` — items per page (default 20, max 100)
- `category` — optional filter, e.g. `electronics`
- `cursor` — bookmark from previous response's `nextCursor`

**Response:**

```json
{
  "products": [...],
  "nextCursor": "eyJjcmVhdGVkQXQiOi...",
  "hasMore": true
}
```

Core query logic (simplified):

```typescript
// First page: no cursor
orderBy: [{ createdAt: "desc" }, { id: "desc" }];
take: 21; // fetch 1 extra to know if there's a next page

// Next page: with cursor
where: {
  OR: [
    { createdAt: { lt: cursorDate } },
    { AND: [{ createdAt: cursorDate }, { id: { lt: cursorId } }] },
  ];
}
```

### Step 4 — Frontend (bonus UI)

- Category dropdown filter
- Toggle: **Pagination** (default) or **Continuous scroll**
- Pagination: Previous / Next buttons, 20 items per page
- Continuous scroll: auto-loads more when you reach the bottom

### Step 5 — Run locally

**Backend:**

```bash
cd backend
cp .env.example .env        # set DATABASE_URL
bun install
bun run db:generate         # generate Prisma client from schema
bun run db:migrate          # create tables in PostgreSQL
bun run seed                # insert 200k products
bun run dev                 # start API on :3000
```

**Frontend:**

```bash
cd frontend
cp .env.example .env.local  # set NEXT_PUBLIC_API_URL=http://localhost:3000
npm install
npm run dev                 # start UI on :3001
```

---

## 4. How Each Assignment Condition Is Met

### Condition 1: Browse ~200,000 products, newest first

- Seed script creates exactly **200,000 products**
- API sorts by `created_at DESC, id DESC` on every request
- Index on `(created_at, id)` makes this fast

### Condition 2: Filter by category

- `GET /api/products?category=electronics` filters before paginating
- Index on `(category, created_at, id)` keeps filtered queries fast
- Frontend has a category dropdown

### Condition 3: Pagination should be fast

- **Cursor pagination** — no `OFFSET`, database walks the index directly
- **Composite indexes** — Postgres doesn't need to sort the full table
- Fetch `limit + 1` rows to detect "has more" without a separate count query

### Condition 4: Correct data while data is changing

This is the most important requirement.

**Scenario:** User loads page 1. While they browse, 50 new products are inserted.

**With offset pagination (bad):**

- New products push existing rows down
- Page 2 might repeat products from page 1 or skip some

**With cursor pagination (what we use):**

- New products have a **newer** `created_at` → they appear at the **top** (page 1)
- User's cursor points to an **older** position
- Page 2 only fetches products **older than the cursor**
- New inserts at the top **do not affect** pages the user has already passed
- Result: **no duplicates, no missed products**

### Condition 5: Product fields

Each product has all required fields:

| Field        | Type          |
| ------------ | ------------- |
| `id`         | UUID (unique) |
| `name`       | string        |
| `category`   | string        |
| `price`      | decimal       |
| `created_at` | timestamp     |
| `updated_at` | timestamp     |

### Condition 6: Seed script committed, fast approach

- [`backend/prisma/seed.ts`](backend/prisma/seed.ts) is in the repo
- Uses bulk `INSERT` in batches of 5,000 — **40 DB calls** instead of 200,000

### Bonus: Simple UI

- Next.js frontend with Shadcn components
- Pagination and infinite scroll modes
- Not graded, but makes the API easy to demo

---

## Deployment

### Database — Neon

1. Create a free Neon project
2. Copy the **pooled** connection string → `DATABASE_URL` in backend `.env`

### Backend — AWS EC2

1. Launch EC2 (e.g. t3.micro)
2. Security group: open port **3000** (API) and **22** (SSH)
3. Install Bun: `curl -fsSL https://bun.sh/install | bash`
4. Clone repo, `cd backend`, `bun install`
5. Set `.env`: `DATABASE_URL`, `PORT=3000`, `CORS_ORIGIN=<vercel-url>`
6. Run once: `bun run db:migrate && bun run seed`
7. Start with systemd:

```bash
sudo cp deploy/products-api.service /etc/systemd/system/
sudo systemctl enable --now products-api
```

### Frontend — Vercel

1. Import repo, root directory: `frontend`
2. Set `NEXT_PUBLIC_API_URL=http://<ec2-ip>:3000`

---

## How I Used AI

I personally verified and understood: cursor pagination logic, index design, seed performance, and why offset pagination fails — these are the core parts I'd explain in the interview.

## Quick Stability Test

1. Load page 1 → note the product IDs
2. Insert 50 new products (re-run seed or add via script)
3. Load page 2 using `nextCursor` from page 1
4. Confirm: no duplicate IDs between pages, no gaps in the sequence
