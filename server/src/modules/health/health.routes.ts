import { Router } from "express";
import { ok } from "../../types/api-response";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.json(ok({
    status: "ok",
    service: "shopmate-api",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }));
});
