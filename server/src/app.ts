import express from "express";
import { chatRouter } from "./modules/chat/chat.routes";
import { productRouter } from "./modules/products/product.routes";

export const app = express();

app.use(express.json());
app.use("/api/chat", chatRouter);
app.use("/api/products", productRouter);

app.get("/", (_request, response) => {
  response.send("ShopMate server is running.");
});
