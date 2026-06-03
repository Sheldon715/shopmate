import { Router } from "express";
import { createAsrTranscribeController } from "./asr.controller";

export const asrRouter = Router();

asrRouter.post("/transcribe", createAsrTranscribeController());
