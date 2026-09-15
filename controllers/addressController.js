import Address from "../models/Address.js";


// ─────────────────────────────────────────────────────────────
// HELPER: Build GeoJSON location
// GeoJSON coordinates MUST be [longitude, latitude]
// ─────────────────────────────────────────────────────────────
const buildLocation = (lat, lng) => {
  if (
    lat === undefined ||
    lat === null ||
    lng === undefined ||
    lng === null ||
    lat === "" ||
    lng === ""
  ) {
    return undefined;
  }

  const latitude = Number(lat);
  const longitude = Number(lng);

  // Basic coordinate validation
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return undefined;
  }

  return {
    type: "Point",
    coordinates: [longitude, latitude],
  };
};


// ─────────────────────────────────────────────────────────────
// GET ALL ADDRESSES
// ─────────────────────────────────────────────────────────────
export const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({
      userId: req.user._id,
    }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: addresses.length,
      data: addresses,
    });

  } catch (error) {
    console.error("GET ADDRESSES ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ─────────────────────────────────────────────────────────────
// ADD NEW ADDRESS
// ─────────────────────────────────────────────────────────────
export const addAddress = async (req, res) => {
  try {
    const {
      fullName,
      phone,
      line1,
      line2,
      landmark,

      city,
      state,
      pincode,

      lat,
      lng,

      // Google Maps
      googlePlaceId,

      label,
      isDefault,
    } = req.body;


    // ─────────────────────────────────────────
    // REQUIRED FIELDS
    // ─────────────────────────────────────────
    if (!line1 || !city || !pincode) {
      return res.status(400).json({
        success: false,
        message: "Required address fields missing",
      });
    }


    // ─────────────────────────────────────────
    // BUILD GEO LOCATION
    // ─────────────────────────────────────────
    const location = buildLocation(lat, lng);


    // ─────────────────────────────────────────
    // IF DEFAULT → REMOVE OLD DEFAULT
    // ─────────────────────────────────────────
    if (isDefault === true) {
      await Address.updateMany(
        {
          userId: req.user._id,
        },
        {
          $set: {
            isDefault: false,
          },
        }
      );
    }


    // ─────────────────────────────────────────
    // CREATE ADDRESS
    // ─────────────────────────────────────────
    const address = await Address.create({
      userId: req.user._id,

      fullName,
      phone,

      line1,
      line2,
      landmark,

      city,
      state,
      pincode,

      // Legacy coordinates
      lat:
        lat !== undefined && lat !== null && lat !== ""
          ? Number(lat)
          : undefined,

      lng:
        lng !== undefined && lng !== null && lng !== ""
          ? Number(lng)
          : undefined,

      // Google Maps Place ID
      googlePlaceId: googlePlaceId || undefined,

      // GeoJSON
      location,

      label: label || "Home",

      isDefault: isDefault === true,
    });


    res.status(201).json({
      success: true,
      message: "Address added successfully",
      data: address,
    });

  } catch (error) {
    console.error("ADD ADDRESS ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ─────────────────────────────────────────────────────────────
// UPDATE ADDRESS
// ─────────────────────────────────────────────────────────────
export const updateAddress = async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });


    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }


    const {
      fullName,
      phone,
      line1,
      line2,
      landmark,

      city,
      state,
      pincode,

      lat,
      lng,

      // Google Maps
      googlePlaceId,

      label,
      isDefault,
    } = req.body;


    // ─────────────────────────────────────────
    // DEFAULT ADDRESS
    // ─────────────────────────────────────────
    if (isDefault === true) {
      await Address.updateMany(
        {
          userId: req.user._id,
          _id: { $ne: address._id },
        },
        {
          $set: {
            isDefault: false,
          },
        }
      );
    }


    // ─────────────────────────────────────────
    // BASIC FIELDS
    // ─────────────────────────────────────────
    if (fullName !== undefined) {
      address.fullName = fullName;
    }

    if (phone !== undefined) {
      address.phone = phone;
    }

    if (line1 !== undefined) {
      address.line1 = line1;
    }

    if (line2 !== undefined) {
      address.line2 = line2;
    }

    if (landmark !== undefined) {
      address.landmark = landmark;
    }

    if (city !== undefined) {
      address.city = city;
    }

    if (state !== undefined) {
      address.state = state;
    }

    if (pincode !== undefined) {
      address.pincode = pincode;
    }

    if (label !== undefined) {
      address.label = label;
    }


    // ─────────────────────────────────────────
    // GOOGLE PLACE ID
    // ─────────────────────────────────────────
    if (googlePlaceId !== undefined) {
      address.googlePlaceId = googlePlaceId;
    }


    // ─────────────────────────────────────────
    // LOCATION
    // ─────────────────────────────────────────
    if (
      lat !== undefined ||
      lng !== undefined
    ) {
      const newLat =
        lat !== undefined && lat !== null && lat !== ""
          ? Number(lat)
          : address.lat;

      const newLng =
        lng !== undefined && lng !== null && lng !== ""
          ? Number(lng)
          : address.lng;


      const newLocation = buildLocation(
        newLat,
        newLng
      );


      if (newLocation) {
        address.lat = newLat;
        address.lng = newLng;
        address.location = newLocation;
      }
    }


    // ─────────────────────────────────────────
    // DEFAULT FLAG
    // ─────────────────────────────────────────
    if (typeof isDefault === "boolean") {
      address.isDefault = isDefault;
    }


    await address.save();


    res.status(200).json({
      success: true,
      message: "Address updated successfully",
      data: address,
    });

  } catch (error) {
    console.error("UPDATE ADDRESS ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ─────────────────────────────────────────────────────────────
// DELETE ADDRESS
// ─────────────────────────────────────────────────────────────
export const deleteAddress = async (req, res) => {
  try {
    const address = await Address.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });


    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }


    res.status(200).json({
      success: true,
      message: "Address deleted successfully",
    });

  } catch (error) {
    console.error("DELETE ADDRESS ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ─────────────────────────────────────────────────────────────
// SET DEFAULT ADDRESS
// ─────────────────────────────────────────────────────────────
export const setDefaultAddress = async (req, res) => {
  try {
    const address = await Address.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });


    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }


    // Remove default from all other addresses
    await Address.updateMany(
      {
        userId: req.user._id,
        _id: { $ne: address._id },
      },
      {
        $set: {
          isDefault: false,
        },
      }
    );


    // Set selected address as default
    address.isDefault = true;

    await address.save();


    res.status(200).json({
      success: true,
      message: "Default address updated",
      data: address,
    });

  } catch (error) {
    console.error("SET DEFAULT ADDRESS ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};