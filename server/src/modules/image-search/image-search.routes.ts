import { Router } from "express";
import { createImageSearchInterpretController } from "./image-search.controller";
import { createImageVectorSearchController } from "./image-vector-search.controller";

export const imageSearchRouter = Router();

imageSearchRouter.post("/interpret", createImageSearchInterpretController());
imageSearchRouter.post("/vector-search", createImageVectorSearchController());
