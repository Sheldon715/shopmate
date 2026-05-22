import express from "express";

export const app = express();

app.use(express.json());

app.get("/", (_request, response) => {
  response.send("ShopMate server is running.");
});
