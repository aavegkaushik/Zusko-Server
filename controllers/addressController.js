import Address from "../models/Address.js";


// GET ALL ADDRESSES
export const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({
      userId: req.user._id,
    }).sort({ isDefault: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      count: addresses.length,
      data: addresses,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// ADD NEW ADDRESS
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
      label,
      isDefault,
    } = req.body;

    if (!line1 || !city || !pincode) {
      return res.status(400).json({
        success: false,
        message: "Required address fields missing",
      });
    }

    // If setting default, unset previous default
    if (isDefault) {
      await Address.updateMany(
        { userId: req.user._id },
        { isDefault: false }
      );
    }

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
      lat,
      lng,
      label,
      isDefault: isDefault || false,
    });

    res.status(201).json({
      success: true,
      message: "Address added successfully",
      data: address,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// UPDATE ADDRESS
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
      label,
      isDefault,
    } = req.body;

    if (isDefault) {
      await Address.updateMany(
        { userId: req.user._id },
        { isDefault: false }
      );
    }

    address.fullName = fullName || address.fullName;
    address.phone = phone || address.phone;
    address.line1 = line1 ?? address.line1;
    address.line2 = line2 ?? address.line2;
    address.landmark = landmark || address.landmark;
    address.city = city || address.city;
    address.state = state || address.state;
    address.pincode = pincode || address.pincode;
    address.lat = lat || address.lat;
    address.lng = lng || address.lng;
    address.label = label || address.label;

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
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// DELETE ADDRESS
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
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// SET DEFAULT ADDRESS
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

    await Address.updateMany(
      { userId: req.user._id },
      { isDefault: false }
    );

    address.isDefault = true;

    await address.save();

    res.status(200).json({
      success: true,
      message: "Default address updated",
      data: address,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};