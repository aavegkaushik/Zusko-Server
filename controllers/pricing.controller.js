import Pricing from "../models/Pricing.js";
import { getCache, setCache } from "../utils/cache.js";

// ============================================================
// GET ACTIVE PRICING
// Public endpoint for customer website
// ============================================================

const PRICING_CACHE_KEY = "pricing:customer";
const PRICING_CACHE_TTL = 30 * 60; // 30 minutes

export const getCustomerPricing = async (req, res) => {
  try {
    // Try to serve from Redis cache
    const cached = await getCache(PRICING_CACHE_KEY);
    if (cached) {
      return res.status(200).json({
        success: true,
        count: cached.count,
        data: cached.data,
      });
    }

    // Fallback / Cache Miss: Query MongoDB
    const pricing = await Pricing.find({})
      .sort({
        service: 1,
        category: 1,
        sortOrder: 1,
        name: 1,
        variant: 1,
      })
      .lean();

    const responsePayload = {
      count: pricing.length,
      data: pricing,
    };

    // Populate Redis cache asynchronously without blocking
    await setCache(PRICING_CACHE_KEY, responsePayload, PRICING_CACHE_TTL);

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