/**
 * Promotion Calculation & Conflict-Resolution Engine for Zusko Customer Backend
 *
 * Rules:
 * 1. Original cloth prices are NEVER modified or overwritten.
 * 2. An item receives at most ONE winning promotion (never unintentional stacking of promotions).
 * 3. Priority and Conflict-Resolution:
 *    - Higher priority value wins.
 *    - If tied, more specific scope wins (items > categories > all).
 *    - If tied, highest effective discount wins.
 *    - If tied, most recently updated promotion wins.
 * 4. Percentage discounts can optionally have a maxDiscount cap.
 * 5. Flat discounts cannot exceed the original item price (price cannot be negative).
 * 6. Start/End date validations:
 *    - Inactive promotions: show original price.
 *    - Expired promotions: show original price.
 *    - Future promotions: do not apply yet.
 * 7. Category & item targeting: apply strictly to matching categories and items.
 * 8. Stacking with coupons: respects allowCouponStacking rule.
 */

export const SCOPE_SPECIFICITY = {
  items: 3,
  categories: 2,
  all: 1,
};

/**
 * Checks whether a promotion is currently valid and active on a given date.
 */
export function isPromotionActive(promotion, targetDate = new Date()) {
  if (!promotion || promotion.isActive === false) return false;

  const date = new Date(targetDate);
  if (isNaN(date.getTime())) return false;

  if (promotion.startDate) {
    const start = new Date(promotion.startDate);
    if (!isNaN(start.getTime()) && date < start) {
      return false; // Future promotion - do not apply yet
    }
  }

  if (promotion.endDate) {
    const end = new Date(promotion.endDate);
    if (!isNaN(end.getTime()) && date > end) {
      return false; // Expired promotion - do not apply
    }
  }

  return true;
}

/**
 * Checks if a specific Pricing item matches the promotion targeting criteria.
 */
export function isItemEligibleForPromotion(item, promotion) {
  if (!item || !promotion) return false;

  // 1. Service check (if specific services are targeted)
  if (
    Array.isArray(promotion.applicableServices) &&
    promotion.applicableServices.length > 0
  ) {
    if (!promotion.applicableServices.includes(item.service)) {
      return false;
    }
  }

  // 2. Scope check (all vs categories vs items)
  const scope = promotion.applicableTo || "all";

  if (scope === "all") {
    return true;
  }

  if (scope === "categories") {
    if (
      !Array.isArray(promotion.applicableCategories) ||
      promotion.applicableCategories.length === 0
    ) {
      return false;
    }
    return promotion.applicableCategories.includes(item.category);
  }

  if (scope === "items") {
    if (
      !Array.isArray(promotion.applicableItems) ||
      promotion.applicableItems.length === 0
    ) {
      return false;
    }

    const itemIdStr = String(item._id || item.pricingId || item.clothId || item.id || "");
    return promotion.applicableItems.some((targetId) => {
      const targetStr =
        typeof targetId === "object" && targetId !== null
          ? String(targetId._id || targetId)
          : String(targetId);
      return targetStr === itemIdStr;
    });
  }

  return false;
}

/**
 * Calculates raw discount amount for an item given a promotion.
 */
export function calculateDiscountAmount(originalPrice, promotion) {
  const price = Number(originalPrice);
  if (!Number.isFinite(price) || price <= 0 || !promotion) {
    return 0;
  }

  const val = Number(promotion.discountValue) || 0;
  if (val <= 0) return 0;

  let discount = 0;

  if (promotion.discountType === "percentage") {
    discount = (price * val) / 100;
    if (
      promotion.maxDiscount !== null &&
      promotion.maxDiscount !== undefined &&
      Number(promotion.maxDiscount) > 0
    ) {
      discount = Math.min(discount, Number(promotion.maxDiscount));
    }
  } else if (promotion.discountType === "flat") {
    discount = val;
  }

  // Ensure discount does not exceed original price and is non-negative
  discount = Math.min(price, Math.max(0, discount));

  // Round to 2 decimal places
  return Math.round(discount * 100) / 100;
}

/**
 * Selects the single winning promotion among candidates according to strict priority rules.
 * Prevents unintended stacking of multiple promotions on a single item.
 */
export function resolveWinningPromotion(item, candidatePromotions) {
  if (!Array.isArray(candidatePromotions) || candidatePromotions.length === 0) {
    return null;
  }

  if (candidatePromotions.length === 1) {
    return candidatePromotions[0];
  }

  const originalPrice = Number(item.price) || 0;

  const sorted = [...candidatePromotions].sort((a, b) => {
    // 1. Explicit Priority (Higher priority wins)
    const priorityA = Number(a.priority) || 0;
    const priorityB = Number(b.priority) || 0;
    if (priorityA !== priorityB) {
      return priorityB - priorityA;
    }

    // 2. Specificity (items [3] > categories [2] > all [1])
    const specA = SCOPE_SPECIFICITY[a.applicableTo] || 1;
    const specB = SCOPE_SPECIFICITY[b.applicableTo] || 1;
    if (specA !== specB) {
      return specB - specA;
    }

    // 3. Greatest savings for the customer
    const discA = calculateDiscountAmount(originalPrice, a);
    const discB = calculateDiscountAmount(originalPrice, b);
    if (discA !== discB) {
      return discB - discA;
    }

    // 4. Most recently updated
    const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return dateB - dateA;
  });

  return sorted[0];
}

/**
 * Computes dynamic promotional pricing for a single item.
 * Always returns:
 * {
 *   originalPrice,
 *   discountPercentage,
 *   discountAmount,
 *   finalPrice,
 *   isDiscounted
 * }
 */
export function calculateItemPromotionalPricing(
  item,
  promotions = [],
  targetDate = new Date()
) {
  const originalPrice = Number(item?.originalPrice !== undefined ? item.originalPrice : item?.price) || 0;
  const baseItem = typeof item?.toObject === "function" ? item.toObject() : { ...(item || {}) };

  const promoList = Array.isArray(promotions)
    ? promotions
    : promotions
    ? [promotions]
    : [];

  const eligible = promoList.filter(
    (promo) =>
      isPromotionActive(promo, targetDate) &&
      isItemEligibleForPromotion(baseItem, promo)
  );

  const winningPromo = resolveWinningPromotion(baseItem, eligible);

  if (!winningPromo) {
    return {
      ...baseItem,
      originalPrice,
      discountPercentage: 0,
      discountAmount: 0,
      finalPrice: originalPrice,
      price: originalPrice, // Backward compatibility for legacy code
      isDiscounted: false,
      hasActivePromotion: false,
      appliedPromotion: null,
      appliedPromotionName: "",
    };
  }

  const discountAmount = calculateDiscountAmount(originalPrice, winningPromo);
  const finalPrice = Math.max(0, Math.round((originalPrice - discountAmount) * 100) / 100);
  const discountPercentage =
    originalPrice > 0 ? Math.round((discountAmount / originalPrice) * 100) : 0;

  return {
    ...baseItem,
    originalPrice,
    discountPercentage,
    discountAmount,
    finalPrice,
    price: finalPrice, // Backward compatibility for legacy code
    isDiscounted: discountAmount > 0,
    hasActivePromotion: discountAmount > 0,
    appliedPromotionName: winningPromo.name || "",
    appliedPromotion: {
      _id: winningPromo._id,
      id: winningPromo._id,
      name: winningPromo.name,
      badgeText: winningPromo.badgeText || `${discountPercentage}% OFF`,
      discountType: winningPromo.discountType,
      discountValue: winningPromo.discountValue,
      maxDiscount: winningPromo.maxDiscount,
      applicableTo: winningPromo.applicableTo,
      priority: winningPromo.priority,
      allowCouponStacking: Boolean(winningPromo.allowCouponStacking),
      startDate: winningPromo.startDate,
      endDate: winningPromo.endDate,
    },
  };
}

/**
 * Applies active promotions to a list of Pricing items.
 */
export function applyPromotionsToItems(
  items = [],
  promotions = [],
  targetDate = new Date()
) {
  return items.map((item) =>
    calculateItemPromotionalPricing(item, promotions, targetDate)
  );
}
