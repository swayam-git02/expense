const express = require("express");
const bcrypt = require("bcryptjs");

const authMiddleware = require("../middleware/auth");
const { get, run } = require("../config/db");
const { mapUserRow } = require("../utils/userMapper");

const router = express.Router();

router.use(authMiddleware);

router.get("/profile", async (req, res, next) => {
  try {
    const userRow = await get(
      `
        SELECT id, name, email, avatar, currency, dark_mode, monthly_income
        FROM users
        WHERE id = ?
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      data: mapUserRow(userRow),
    });
  } catch (error) {
    next(error);
  }
});

router.put("/profile", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const avatar = String(req.body.avatar || "").trim();
    const currency = String(req.body.currency || "INR").trim().toUpperCase();
    const darkMode = req.body.darkMode ? 1 : 0;
    const monthlyIncome = Number(req.body.monthlyIncome || 0);

    if (name.length < 2 || !email) {
      res.status(400).json({
        success: false,
        message: "Invalid profile payload",
      });
      return;
    }

    const emailOwner = await get("SELECT id FROM users WHERE email = ?", [email]);
    if (emailOwner && emailOwner.id !== userId) {
      res.status(409).json({
        success: false,
        message: "Email already in use",
      });
      return;
    }

    await run(
      `
        UPDATE users
        SET name = ?, email = ?, avatar = ?, currency = ?, dark_mode = ?, monthly_income = ?
        WHERE id = ?
      `,
      [name, email, avatar, currency || "INR", darkMode, Number.isFinite(monthlyIncome) ? monthlyIncome : 0, userId]
    );

    const updatedUser = await get(
      `
        SELECT id, name, email, avatar, currency, dark_mode, monthly_income
        FROM users
        WHERE id = ?
      `,
      [userId]
    );

    res.json({
      success: true,
      message: "Profile updated",
      data: mapUserRow(updatedUser),
    });
  } catch (error) {
    next(error);
  }
});

router.put("/profile/password", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || newPassword.length < 8) {
      res.status(400).json({
        success: false,
        message: "Invalid password payload",
      });
      return;
    }

    const userRow = await get("SELECT password FROM users WHERE id = ?", [userId]);
    if (!userRow) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, userRow.password);
    if (!isCurrentValid) {
      res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await run("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId]);

    res.json({
      success: true,
      message: "Password updated",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
