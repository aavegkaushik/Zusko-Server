import User from "../models/user.model.js";
import Order from "../models/order.model.js";


// GET USER PROFILE
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// UPDATE USER PROFILE
export const updateProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.name = name || user.name;

    if (email && email !== user.email) {

  const existingEmail =
    await User.findOne({
      email: email.toLowerCase(),
    });

  if (
    existingEmail &&
    existingEmail._id.toString() !==
      user._id.toString()
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Email already exists",
    });
  }

  user.email = email.toLowerCase();
}
    // user.email = email || user.email;

    if (phone && phone !== user.phone) {

  const existingUser =
    await User.findOne({ phone });

  if (
    existingUser &&
    existingUser._id.toString() !==
      user._id.toString()
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Phone number already exists",
    });
  }

  user.phone = phone;
}

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: user,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// UPLOAD AVATAR
export const updateAvatar = async (req, res) => {
  try {
    const { avatar } = req.body;

    if (!avatar) {
      return res.status(400).json({
        success: false,
        message: "Avatar URL required",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar },
      { new: true }
    ).select("-password");

    res.status(200).json({
      success: true,
      message: "Avatar updated",
      data: user,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// ACCOUNT DASHBOARD SUMMARY
export const getDashboardSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    const activeOrders = await Order.countDocuments({
      customerId: userId,
      status: {
        $nin: ["completed", "cancelled"],
      },
    });

    const completedOrders = await Order.countDocuments({
      customerId: userId,
      status: "completed",
    });

    const totalSpentData = await Order.aggregate([
      {
        $match: {
          customerId: req.user._id,
          "payment.status": "paid",
        },
      },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: "$total" },
        },
      },
    ]);

    const totalSpent =
      totalSpentData.length > 0
        ? totalSpentData[0].totalSpent
        : 0;

    res.status(200).json({
      success: true,
      data: {
        activeOrders,
        completedOrders,
        totalSpent,
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};