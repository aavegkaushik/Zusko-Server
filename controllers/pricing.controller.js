import Pricing from "../models/Pricing.js";
import Promotion from "../models/Promotion.js";
import { getCache, setCache } from "../utils/cache.js";
import { applyPromotionsToItems } from "../utils/promotionCalculator.js";

// ============================================================
// GET ACTIVE PRICING WITH DYNAMIC PROMOTIONAL DISCOUNTS
// Public endpoint for customer website
// ============================================================

const PRICING_CACHE_KEY = "pricing:customer";
// Short 15-second TTL ensures real-time responsiveness when Admin changes promotions/prices
const PRICING_CACHE_TTL = 15;

export const getCustomerPricing = async (req, res) => {
  try {
    const isBypass = req.query?.fresh === "true" || req.query?.nocache === "true";

    // 1. Try to serve from Redis cache if not explicitly bypassed
    if (!isBypass) {
      const cached = await getCache(PRICING_CACHE_KEY);
      if (cached) {
        return res.status(200).json({
          success: true,
          count: cached.count,
          data: cached.data,
          activePromotionsCount: cached.activePromotionsCount ?? 0,
        });
      }
    }

    const now = new Date();

    // 2. Query Pricing items from MongoDB
    const pricing = await Pricing.find({
      active: { $ne: false },
    })
      .sort({
        service: 1,
        category: 1,
        sortOrder: 1,
        name: 1,
        variant: 1,
      })
      .lean();

    // 3. Query Active Promotions from shared MongoDB collection
    // Safe read-only query that handles missing collection gracefully
    let activePromotions = [];
    try {
      activePromotions = await Promotion.find({
        isActive: true,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
        ],
      })
        .sort({ priority: -1, updatedAt: -1 })
        .lean();
    } catch (promoErr) {
      console.warn("Could not query promotions collection:", promoErr.message);
      activePromotions = [];
    }

    // 4. Centralized discount calculation for every eligible item
    const computedPricing = applyPromotionsToItems(pricing, activePromotions, now);

    const responsePayload = {
      count: computedPricing.length,
      data: computedPricing,
      activePromotionsCount: activePromotions.length,
    };

    // 5. Populate Redis cache with short TTL
    await setCache(PRICING_CACHE_KEY, responsePayload, PRICING_CACHE_TTL);

    return res.status(200).json({
      success: true,
      count: computedPricing.length,
      data: computedPricing,
      activePromotionsCount: activePromotions.length,
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
