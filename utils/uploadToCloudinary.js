import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

export const uploadToCloudinary = (file) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "zusko-resumes",
                resource_type: "raw",
                public_id: `${Date.now()}-${file.originalname
                    .split(".")[0]
                    .replace(/\s+/g, "-")}`,
            },
            (error, result) => {
                if (error) {
                    return reject(error);
                }

                resolve(result);
            }
        );

        streamifier
            .createReadStream(file.buffer)
            .pipe(stream);
    });
};