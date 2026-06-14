import express from "express";
import  {protect}  from "../middleware/auth.middleware.js";

import {
  getSessions,
  logoutCurrentSession,
  logoutAllSessions,
  deleteAccount,
} from "../controllers/securityController.js";

const router = express.Router();

router.get("/sessions", protect, getSessions);

router.delete("/logout-current", protect, logoutCurrentSession);

router.delete("/logout-all", protect, logoutAllSessions);

router.delete("/delete-account", protect, deleteAccount);

export default router;