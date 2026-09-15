// =========================================================
// ZUSKO DELIVERY SERVICE
// =========================================================
// Rules:
// 1. Orders below ₹500 pay delivery charges
// 2. Orders ₹500+ get FREE delivery
// 3. Below ₹500 = ₹4.72 per ROAD KM
// 4. Road distance calculated using OSRM
// 5. Serviceability verified using OpenStreetMap Nominatim
// 6. Zusko reference location = Jail Churaha, Jhansi
// =========================================================

const ZUSKO_LOCATION = {
  latitude: 25.4435332,
  longitude: 78.57616,
};

// =========================================================
// DELIVERY CONFIG
// =========================================================

export const DELIVERY_RATE_PER_KM = 10;

// This is NOT a minimum order restriction.
// It is only the threshold for FREE delivery.
export const FREE_DELIVERY_THRESHOLD = 500;

// Backward compatibility if other files import MIN_ORDER_VALUE.
export const MIN_ORDER_VALUE = FREE_DELIVERY_THRESHOLD;

// =========================================================
// EXTERNAL SERVICES
// =========================================================

const OSRM_BASE_URL = "https://router.project-osrm.org";
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

const EXTERNAL_REQUEST_TIMEOUT = 8000;

// =========================================================
// APPROXIMATE JHANSI BOUNDS
// =========================================================

const JHANSI_BOUNDS = {
  minLat: 25.34,
  maxLat: 25.55,
  minLng: 78.45,
  maxLng: 78.70,
};

// =========================================================
// COORDINATE VALIDATION
// =========================================================

export const isValidCoordinates = (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
};

// =========================================================
// ROUGH JHANSI CHECK
// =========================================================

export const isInsideJhansiBounds = (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);

  return (
    latitude >= JHANSI_BOUNDS.minLat &&
    latitude <= JHANSI_BOUNDS.maxLat &&
    longitude >= JHANSI_BOUNDS.minLng &&
    longitude <= JHANSI_BOUNDS.maxLng
  );
};

// =========================================================
// HAVERSINE
// =========================================================
// Only useful as a sanity check.
// NEVER used for delivery pricing.
// =========================================================

export const calculateStraightDistanceKm = (
  lat1,
  lng1,
  lat2,
  lng2
) => {
  const latitude1 = Number(lat1);
  const longitude1 = Number(lng1);
  const latitude2 = Number(lat2);
  const longitude2 = Number(lng2);

  if (
    !isValidCoordinates(latitude1, longitude1) ||
    !isValidCoordinates(latitude2, longitude2)
  ) {
    throw new Error(
      "Invalid coordinates for distance calculation"
    );
  }

  const R = 6371;

  const dLat =
    ((latitude2 - latitude1) * Math.PI) / 180;

  const dLng =
    ((longitude2 - longitude1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(
      (latitude1 * Math.PI) / 180
    ) *
      Math.cos(
        (latitude2 * Math.PI) / 180
      ) *
      Math.sin(dLng / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return Number((R * c).toFixed(2));
};

// =========================================================
// FETCH WITH TIMEOUT
// =========================================================

const fetchWithTimeout = async (
  url,
  options = {},
  timeout = EXTERNAL_REQUEST_TIMEOUT
) => {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(
        "External service request timed out"
      );

      timeoutError.code =
        "EXTERNAL_SERVICE_TIMEOUT";

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

// =========================================================
// REVERSE GEOCODING
// =========================================================

export const reverseGeocodeLocation = async (
  latitude,
  longitude
) => {
  if (!isValidCoordinates(latitude, longitude)) {
    const error = new Error(
      "Invalid coordinates for reverse geocoding"
    );

    error.code = "INVALID_COORDINATES";

    throw error;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  const url =
    `${NOMINATIM_BASE_URL}/reverse` +
    `?format=jsonv2` +
    `&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}` +
    `&zoom=18` +
    `&addressdetails=1`;

  let response;

  try {
    response = await fetchWithTimeout(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Zusko/1.0 (delivery-service)",
        },
      }
    );
  } catch (error) {
    const geocodeError = new Error(
      "Unable to verify service area"
    );

    geocodeError.code =
      error?.code ||
      "GEOCODING_UNAVAILABLE";

    throw geocodeError;
  }

  if (!response.ok) {
    const error = new Error(
      "Unable to verify service area"
    );

    error.code = "GEOCODING_UNAVAILABLE";

    throw error;
  }

  const data = await response.json();

  if (!data || !data.address) {
    const error = new Error(
      "Unable to determine location"
    );

    error.code = "LOCATION_NOT_FOUND";

    throw error;
  }

  const address = data.address;

  const possibleCityNames = [
    address.city,
    address.town,
    address.municipality,
    address.city_district,
    address.village,
  ]
    .filter(Boolean)
    .map((value) =>
      String(value).trim().toLowerCase()
    );

  const isJhansi =
    possibleCityNames.includes("jhansi");

  return {
    serviceable: isJhansi,

    displayName:
      data.display_name || "",

    address,

    city:
      address.city ||
      address.town ||
      address.municipality ||
      address.district ||
      "",

    state: address.state || "",

    postcode: address.postcode || "",

    country: address.country || "",

    latitude: lat,
    longitude: lng,
  };
};

// =========================================================
// SERVICEABILITY
// =========================================================

export const checkJhansiServiceability = async (
  latitude,
  longitude
) => {
  if (!isValidCoordinates(latitude, longitude)) {
    const error = new Error(
      "Valid GPS location is required"
    );

    error.code = "INVALID_COORDINATES";

    throw error;
  }

  // Fast rejection for clearly outside Jhansi.
  if (
    !isInsideJhansiBounds(
      latitude,
      longitude
    )
  ) {
    const error = new Error(
      "We are not serving in this area yet."
    );

    error.code = "OUTSIDE_SERVICE_AREA";

    throw error;
  }

  const location =
    await reverseGeocodeLocation(
      latitude,
      longitude
    );

  if (!location.serviceable) {
    const error = new Error(
      "We are not serving in this area yet."
    );

    error.code = "OUTSIDE_SERVICE_AREA";

    throw error;
  }

  return location;
};

// =========================================================
// ROAD DISTANCE USING OSRM
// =========================================================

export const getRoadDistanceKm = async (
  latitude,
  longitude
) => {
  if (!isValidCoordinates(latitude, longitude)) {
    const error = new Error(
      "Invalid customer coordinates"
    );

    error.code = "INVALID_COORDINATES";

    throw error;
  }

  const customerLatitude =
    Number(latitude);

  const customerLongitude =
    Number(longitude);

  // IMPORTANT:
  // OSRM expects longitude,latitude
  const url =
    `${OSRM_BASE_URL}/route/v1/driving/` +
    `${ZUSKO_LOCATION.longitude},${ZUSKO_LOCATION.latitude};` +
    `${customerLongitude},${customerLatitude}` +
    `?overview=false&steps=false`;

  let response;

  try {
    response = await fetchWithTimeout(
      url,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );
  } catch (error) {
    const routingError = new Error(
      "Unable to calculate road distance"
    );

    routingError.code =
      error?.code ||
      "ROUTING_UNAVAILABLE";

    throw routingError;
  }

  if (!response.ok) {
    const error = new Error(
      "Unable to calculate road distance"
    );

    error.code = "ROUTING_UNAVAILABLE";

    throw error;
  }

  const data = await response.json();

  if (
    data.code !== "Ok" ||
    !Array.isArray(data.routes) ||
    data.routes.length === 0
  ) {
    const error = new Error(
      "Route not found for this location"
    );

    error.code = "ROUTE_NOT_FOUND";

    throw error;
  }

  const distanceMeters =
    Number(data.routes[0].distance);

  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0
  ) {
    const error = new Error(
      "Invalid road distance returned by routing service"
    );

    error.code =
      "INVALID_ROUTE_DISTANCE";

    throw error;
  }

  const distanceKm =
    distanceMeters / 1000;

  return Number(
    distanceKm.toFixed(2)
  );
};

// =========================================================
// DELIVERY FEE
// =========================================================

export const calculateDeliveryFee = (
  distanceKm,
  orderValue
) => {
  const distance = Number(distanceKm);
  const value = Number(orderValue);

  if (
    !Number.isFinite(distance) ||
    distance < 0
  ) {
    throw new Error(
      "Invalid delivery distance"
    );
  }

  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      "Invalid order value"
    );
  }

  // ₹500 or above = FREE DELIVERY
  if (
    value >= FREE_DELIVERY_THRESHOLD
  ) {
    return 0;
  }

  // Below ₹500 = ₹4.72 per road KM
  const fee =
    distance * DELIVERY_RATE_PER_KM;

  return Number(
    fee.toFixed(2)
  );
};

// =========================================================
// COMPLETE DELIVERY CALCULATION
// =========================================================

export const calculateDelivery = async ({
  latitude,
  longitude,
  orderValue,
}) => {
  // -------------------------------------------------------
  // 1. VALIDATE GPS
  // -------------------------------------------------------

  if (
    !isValidCoordinates(
      latitude,
      longitude
    )
  ) {
    const error = new Error(
      "Valid GPS location is required"
    );

    error.code = "INVALID_COORDINATES";

    throw error;
  }

  // -------------------------------------------------------
  // 2. VALIDATE ORDER VALUE
  // -------------------------------------------------------
  // IMPORTANT:
  // There is NO minimum order restriction.
  // ₹500 is only the free-delivery threshold.
  // -------------------------------------------------------

  const numericOrderValue =
    Number(orderValue);

  if (
    !Number.isFinite(
      numericOrderValue
    ) ||
    numericOrderValue < 0
  ) {
    const error = new Error(
      "Invalid order value"
    );

    error.code = "INVALID_ORDER_VALUE";

    throw error;
  }

  // -------------------------------------------------------
  // 3. CHECK SERVICEABILITY
  // -------------------------------------------------------

  const serviceability =
    await checkJhansiServiceability(
      latitude,
      longitude
    );

  // -------------------------------------------------------
  // 4. ACTUAL ROAD DISTANCE
  // -------------------------------------------------------

  const distanceKm =
    await getRoadDistanceKm(
      latitude,
      longitude
    );

  // -------------------------------------------------------
  // 5. DELIVERY FEE
  // -------------------------------------------------------

  const deliveryFee =
    calculateDeliveryFee(
      distanceKm,
      numericOrderValue
    );

  // -------------------------------------------------------
  // 6. FINAL RESPONSE
  // -------------------------------------------------------

  return {
    serviceable: true,

    zuskoLocation: {
      latitude:
        ZUSKO_LOCATION.latitude,

      longitude:
        ZUSKO_LOCATION.longitude,
    },

    customerLocation: {
      latitude:
        Number(latitude),

      longitude:
        Number(longitude),
    },

    location: {
      city:
        serviceability.city,

      state:
        serviceability.state,

      pincode:
        serviceability.postcode,

      displayName:
        serviceability.displayName,
    },

    distanceKm,

    ratePerKm:
      DELIVERY_RATE_PER_KM,

    deliveryFee,

    freeDeliveryThreshold:
      FREE_DELIVERY_THRESHOLD,
  };
};