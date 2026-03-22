const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { get, run } = require("../config/db");
const { mapUserRow } = require("../utils/userMapper");

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET || "change_me_in_production",
    {
      expiresIn: "7d",
    }
  );
}

router.post("/register", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (name.length < 2 || !email || password.length < 6) {
      res.status(400).json({
        success: false,
        message: "Invalid registration data",
      });
      return;
    }

    const existingUser = await get("SELECT id FROM users WHERE email = ?", [email]);
    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "Email already registered",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const insertResult = await run(
      `
        INSERT INTO users (name, email, password)
        VALUES (?, ?, ?)
      `,
      [name, email, hashedPassword]
    );

    const userRow = await get(
      `
        SELECT id, name, email, avatar, currency, dark_mode, monthly_income
        FROM users
        WHERE id = ?
      `,
      [insertResult.id]
    );

    const user = mapUserRow(userRow);
    const token = signToken(user);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      data: {
        token,
        user,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
      return;
    }

    const userWithPassword = await get(
      `
        SELECT id, name, email, password, avatar, currency, dark_mode, monthly_income
        FROM users
        WHERE email = ?
      `,
      [email]
    );

    if (!userWithPassword) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, userWithPassword.password);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
      return;
    }

    const user = mapUserRow(userWithPassword);
    const token = signToken(user);

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
