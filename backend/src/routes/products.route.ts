import { Router } from "express";
import {
  getCategories,
  retrieveProducts,
} from "../controllers/products.controller";

export const productsRouter = Router();

productsRouter.get("/categories", getCategories);

productsRouter.get("/", retrieveProducts);
