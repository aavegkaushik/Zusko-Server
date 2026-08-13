import BusinessLead from "../models/BusinessLead.js";

export const createBusinessLead = async (req, res) => {
  try {
    const lead = await BusinessLead.create(req.body);

    return res.status(201).json({
      success: true,
      message: "Business lead submitted successfully.",
      lead,
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Unable to submit business lead.",
    });

  }
};