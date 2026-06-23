import cors from "cors";
import express from "express";
import { productsRouter } from "./routes/products.route";

const app = express();

const port = Number(process.env.PORT) || 3000;

const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3001";

app.use(
  cors({
    origin: corsOrigin.split(",").map((value) => value.trim()),
  }),
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/products", productsRouter);

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
