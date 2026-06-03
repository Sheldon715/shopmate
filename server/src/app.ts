import express from "express";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { getEnv } from "./lib/env";
import { createCorsMiddleware } from "./middleware/cors";
import { asrRouter } from "./modules/asr/asr.routes";
import { cartRouter } from "./modules/cart/cart.routes";
import { chatRouter } from "./modules/chat/chat.routes";
import { healthRouter } from "./modules/health/health.routes";
import { productImageRouter } from "./modules/images/image.routes";
import { productRouter } from "./modules/products/product.routes";
import { fail } from "./types/api-response";

export const app = express();
const { corsAllowedOrigins } = getEnv();

const apiNotFoundHandler: RequestHandler = (request, response) => {
  response
    .status(404)
    .json(fail("API_NOT_FOUND", `API route not found: ${request.originalUrl}`));
};

const apiErrorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (isJsonParseError(error)) {
    response
      .status(400)
      .json(fail("INVALID_JSON", "Request body must be valid JSON."));
    return;
  }

  console.error("Unhandled API error:", error);
  response.status(500).json(fail("INTERNAL_ERROR", "Internal server error."));
};

app.use(createCorsMiddleware(corsAllowedOrigins));
app.use(express.json());
app.use("/images/products", productImageRouter);
app.use("/api/asr", asrRouter);
app.use("/api/chat", chatRouter);
app.use("/api/cart", cartRouter);
app.use("/api/health", healthRouter);
app.use("/api/products", productRouter);
app.use("/api", apiNotFoundHandler);

app.get("/", (_request, response) => {
  response.send("ShopMate server is running.");
});

app.use(apiErrorHandler);

function isJsonParseError(error: unknown): boolean {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    type?: unknown;
  };

  return (
    (record.status === 400 || record.statusCode === 400)
    && record.type === "entity.parse.failed"
  );
}
