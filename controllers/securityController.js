import Session from "../models/session.model.js";
import User from "../models/user.model.js";


// GET ACTIVE SESSIONS
export const getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({
      userId: req.user._id,
    }).sort({
      lastActive: -1,
    });

    res.status(200).json({
      success: true,
      data: sessions,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


// LOGOUT CURRENT DEVICE
export const logoutCurrentSession = async (req, res) => {
  try {
    await Session.deleteOne({
      userId: req.user._id,
      token: req.token,
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


// LOGOUT ALL DEVICES
export const logoutAllSessions = async (req, res) => {
  try {
    await Session.deleteMany({
      userId: req.user._id,
    });

    res.status(200).json({
      success: true,
      message: "Logged out from all devices",
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


// DELETE ACCOUNT
export const deleteAccount = async (req, res) => {
  try {
    await Session.deleteMany({
      userId: req.user._id,
    });

    await User.findByIdAndDelete(req.user._id);

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};