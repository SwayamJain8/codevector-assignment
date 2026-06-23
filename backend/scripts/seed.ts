import { prisma } from "../src/lib/db";
import { randomUUID } from "crypto";

const TOTAL_PRODUCTS = 200_000;
const BATCH_SIZE = 5_000; // rows per INSERT statement

const CATEGORIES = [
  "electronics",
  "clothing",
  "home",
  "sports",
  "books",
  "toys",
  "beauty",
  "grocery",
  "automotive",
  "garden",
] as const;

const ADJECTIVES = ["Premium", "Classic", "Essential", "Compact", "Deluxe"];
const NOUNS = ["Speaker", "Jacket", "Lamp", "Ball", "Novel"];

/**
 * Build one batch of SQL value tuples:  ('id', 'name', 'category', price, 'created_at', 'updated_at'), ...
 */
function buildBatch(startIndex: number, batchSize: number): string {
  const now = Date.now();
  const rows: string[] = [];

  for (let i = 0; i < batchSize; i++) {
    const index = startIndex + i;

    const id = randomUUID();
    const category = CATEGORIES[index % CATEGORIES.length];
    const name = `${ADJECTIVES[index % ADJECTIVES.length]} ${NOUNS[(index * 7) % NOUNS.length]} ${index}`;
    const price = ((index % 5000) + 99) / 100;

    // Each product is 1 second older than the previous → clear "newest first" ordering
    const createdAt = new Date(now - index * 1000).toISOString();

    // Escape single quotes in names for SQL safety
    const safeName = name.replace(/'/g, "''");

    rows.push(
      `('${id}', '${safeName}', '${category}', ${price.toFixed(2)}, '${createdAt}', '${createdAt}')`,
    );
  }

  return rows.join(",\n");
}

async function main() {
  // Start fresh every time
  console.log("Clearing existing products...");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE products`);

  console.log(`Seeding ${TOTAL_PRODUCTS.toLocaleString()} products...`);
  const startedAt = Date.now();

  // Insert in batches of 5,000
  for (let start = 0; start < TOTAL_PRODUCTS; start += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, TOTAL_PRODUCTS - start);
    const values = buildBatch(start, batchSize);

    await prisma.$executeRawUnsafe(`
      INSERT INTO products (id, name, category, price, created_at, updated_at)
      VALUES ${values}
    `);

    console.log(
      `Inserted ${Math.min(start + batchSize, TOTAL_PRODUCTS).toLocaleString()} / ${TOTAL_PRODUCTS.toLocaleString()}`,
    );
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Seed complete in ${elapsed}s`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
