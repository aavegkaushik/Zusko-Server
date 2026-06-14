import Job from "../models/Job.model.js";
import Application from "../models/Application.model.js";
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";
import { sendEmail } from "../utils/sendEmail.js";
export const applyJob = async (req, res) => {
    try {
        const {
            fullName,
            email,
            phone,
            coverLetter,
            jobId,
        } = req.body;

        // Check duplicate application
        const existing = await Application.findOne({
            email,
            job: jobId,
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: "You have already applied for this position.",
            });
        }

        // Check resume
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Resume is required.",
            });
        }

        // Upload resume to Cloudinary
        const uploadedResume = await uploadToCloudinary(req.file);

        // Save application
        const application = await Application.create({
            job: jobId,
            fullName,
            email,
            phone,
            coverLetter,
            resumeUrl: uploadedResume.secure_url,
            resumePublicId: uploadedResume.public_id,
        });

        // Fetch Job Details
const job = await Job.findById(jobId);
const LOGO_URL = "https://www.zusko.in/assets/zusko-CuTZ8EeH.png"
// Send Confirmation Email
try {
  await sendEmail({
    to: email,
    from: process.env.CAREERS_MAIL_FROM,
    subject: `Application Received – ${job?.title || "Zusko Careers"}`,
    html: `
<div style="background:#f3f2f1;padding:40px 20px;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="600" align="center" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

    <!-- Header -->
    <tr>
      <td style="padding:24px 32px;border-bottom:1px solid #e5e5e5;">
        <img src="${LOGO_URL}" alt="Zusko" style="height:42px;">
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:40px 32px;">

        <h1 style="margin:0 0 24px;color:#323130;font-size:28px;">
          Application Received
        </h1>

        <p style="font-size:16px;color:#323130;">
          Hi <strong>${fullName}</strong>,
        </p>

        <p style="font-size:15px;color:#605e5c;line-height:1.7;">
          Thank you for applying to <strong>Zusko</strong>.
          We've successfully received your application for the role of
          <strong>${job?.title}</strong>.
        </p>

        <table width="100%" style="background:#faf9f8;border:1px solid #edebe9;border-radius:10px;margin:30px 0;">
          <tr>
            <td style="padding:24px;">

              <div style="font-size:13px;color:#605e5c;">Position</div>

              <div style="font-size:18px;font-weight:600;color:#323130;margin-top:6px;">
                ${job?.title}
              </div>

              <div style="margin-top:20px;font-size:13px;color:#605e5c;">
                Application Status
              </div>

              <div style="
                display:inline-block;
                background:#fff4ce;
                color:#8a6d00;
                padding:8px 16px;
                border-radius:999px;
                margin-top:8px;
                font-weight:600;
              ">
                Applied
              </div>

            </td>
          </tr>
        </table>

        <p style="font-size:15px;color:#605e5c;line-height:1.7;">
          Our recruitment team will carefully review your profile.
          If shortlisted, we'll contact you regarding the next steps.
        </p>

      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#faf9f8;padding:24px 32px;border-top:1px solid #edebe9;">

        <p style="margin:0;font-weight:600;color:#323130;">
          Team Zusko
        </p>

        <p style="margin:10px 0;color:#605e5c;font-size:13px;">
          Building the future of smart laundry experiences.
        </p>

        <p style="margin:0;color:#8a8886;font-size:12px;">
          careers@zusko.in • www.zusko.in
        </p>

        <p style="margin-top:10px;color:#8a8886;font-size:12px;">
          © ${new Date().getFullYear()} Zusko. All rights reserved.
          <strong>Note: </strong>This is an automated message. Please do not reply to this email.
        </p>

      </td>
    </tr>

  </table>

</div>
`,
  });

  console.log(`Confirmation email sent to ${email}`);
} catch (emailError) {
  console.error("Confirmation email failed:", emailError);
}

        res.status(201).json({
            success: true,
            message: "Application submitted successfully.",
            application,
        });

    } catch (error) {
        console.error("Apply Job Error:", error);

        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const getJobs = async (req, res) => {
    try {
        const jobs = await Job.find({
            isActive: true,
        }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            jobs,
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const getApplications = async (req, res) => {
    try {
        const applications = await Application.find()
            .populate("job")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            applications,
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const createJob = async (req, res) => {
    try {
        const {
            title,
            department,
            location,
            type,
            salary,
            description,
            requirements,
        } = req.body;

        const job = await Job.create({
            title,
            department,
            location,
            type,
            salary,
            description,
            requirements,
        });

        res.status(201).json({
            success: true,
            message: "Job created successfully.",
            job,
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};