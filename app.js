import "dotenv/config";
import express from "express";
import { configureApp } from "./backend/src/app.js";

const app = express();
configureApp(app);

export default app;
