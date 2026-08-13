import express from "express";

import {
  createBusinessLead,
} from "../controllers/businessLead.controller.js";

const router = express.Router();

router.post("/", createBusinessLead);

export default router;