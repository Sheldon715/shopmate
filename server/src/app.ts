import express from "express";
import { productRouter } from "./modules/products/product.routes";

export const app = express();

app.use(express.json());
app.use("/api/products", productRouter);

app.get("/", (_request, response) => {
  response.send("ShopMate server is running.");
});
