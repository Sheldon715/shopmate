import type { RequestHandler } from "express";

export function createCorsMiddleware(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(
    allowedOrigins.map((origin) => origin.trim()).filter(Boolean),
  );

  return (request, response, next) => {
    if (allowed.size === 0) {
      next();
      return;
    }

    const origin = request.get("origin");

    if (!origin || !allowed.has(origin)) {
      next();
      return;
    }

    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");

    if (request.method === "OPTIONS") {
      response.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PATCH,DELETE,OPTIONS",
      );
      response.setHeader(
        "Access-Control-Allow-Headers",
        request.get("access-control-request-headers") ?? "Content-Type",
      );
      response.status(204).end();
      return;
    }

    next();
  };
}
