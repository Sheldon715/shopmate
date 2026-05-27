import { Router } from "express";
import { createChatStreamController } from "./chat.controller";

export const chatRouter = Router();

chatRouter.post("/stream", createChatStreamController());
