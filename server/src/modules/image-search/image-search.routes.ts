import { Router } from "express";
import { createImageSearchInterpretController } from "./image-search.controller";

export const imageSearchRouter = Router();

imageSearchRouter.post("/interpret", createImageSearchInterpretController());
