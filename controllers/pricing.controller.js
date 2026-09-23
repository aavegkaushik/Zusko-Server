import Pricing from "../models/Pricing.js";

// ============================================================
// GET ACTIVE PRICING
// Public endpoint for customer website
// ============================================================

export const getCustomerPricing = async (req, res) => {
  try {
    const pricing = await Pricing.find({})
      .sort({
        service: 1,
        category: 1,
        sortOrder: 1,
        name: 1,
        variant: 1,
      })
      .lean();

    return res.status(200).json({
      success: true,
      count: pricing.length,
      data: pricing,
    });
  } catch (error) {
    console.error("GET CUSTOMER PRICING ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch pricing",
      error: error.message,
    });
  }
};