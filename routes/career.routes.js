import express from "express";

import {
    applyJob,
    getJobs,
    getApplications,
    createJob
} from "../controllers/career.controller.js";

import { uploadResume } from "../middleware/uploadResume.js";

import { verifyAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/jobs", getJobs);

router.post(
    "/apply",
    uploadResume.single("resume"),
    applyJob
);

// router.post(
//     "/create",
//     createJob
// );

// router.get(
//     "/applications",
//     verifyAdmin,
//     getApplications
// );

export default router;