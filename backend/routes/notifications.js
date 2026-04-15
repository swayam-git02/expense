const express = require("express");

const authMiddleware = require("../middleware/auth");
const {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../utils/notifications");

const router = express.Router();

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const data = await listNotifications({
      userId: req.user.id,
      limit: req.query.limit,
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/read-all", async (req, res, next) => {
  try {
    const data = await markAllNotificationsRead({
      userId: req.user.id,
    });

    res.json({
      success: true,
      message: "Notifications marked as read",
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:id/read", async (req, res, next) => {
  try {
    const notificationId = Number(req.params.id);
    if (!notificationId) {
      res.status(400).json({
        success: false,
        message: "Invalid notification id",
      });
      return;
    }

    const data = await markNotificationRead({
      userId: req.user.id,
      notificationId,
    });

    if (!data) {
      res.status(404).json({
        success: false,
        message: "Notification not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Notification marked as read",
      data,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
