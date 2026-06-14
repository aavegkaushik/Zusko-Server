import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema(
    {
        job: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Job",
            required: true,
        },

        fullName: String,

        email: String,

        phone: String,

        coverLetter: String,

        resumeUrl: String,

        resumePublicId: String,

        status: {
            type: String,
            enum: [
                "Applied",
                "Under Review",
                "Interview",
                "Selected",
                "Rejected",
            ],
            default: "Applied",
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model(
    "Application",
    applicationSchema
);