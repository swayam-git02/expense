const express = require("express");

const authMiddleware = require("../middleware/auth");
const { all, get, run } = require("../config/db");
const { getBudgetAlerts } = require("../utils/budgetAlerts");

const router = express.Router();

router.use(authMiddleware);

router.get("/alerts", async (req, res, next) => {
  try {
    const data = await getBudgetAlerts({
      userId: req.user.id,
      month: req.query.month,
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const category = String(req.body.category || "").trim();
    const limitAmount = Number(req.body.limit_amount ?? req.body.limitAmount ?? 0);
    const month = String(req.body.month || "").trim();

    if (!category || !month || !Number.isFinite(limitAmount) || limitAmount <= 0) {
      res.status(400).json({
        success: false,
        message: "Invalid budget payload",
      });
      return;
    }

    const existing = await get(
      `
        SELECT id
        FROM budgets
        WHERE user_id = ? AND category = ? AND month = ?
      `,
      [userId, category, month]
    );

    if (existing) {
      await run(
        `
          UPDATE budgets
          SET limit_amount = ?
          WHERE id = ?
        `,
        [limitAmount, existing.id]
      );
    } else {
      await run(
        `
          INSERT INTO budgets (user_id, category, limit_amount, month)
          VALUES (?, ?, ?, ?)
        `,
        [userId, category, limitAmount, month]
      );
    }

    const budgets = await all(
      `
        SELECT id, user_id, category, limit_amount, month
        FROM budgets
        WHERE user_id = ?
        ORDER BY month DESC, id DESC
      `,
      [userId]
    );

    res.status(201).json({
      success: true,
      message: "Budget saved",
      data: budgets,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const month = String(req.query.month || "").trim();

    let sql = `
      SELECT id, user_id, category, limit_amount, month
      FROM budgets
      WHERE user_id = ?
    `;
    const params = [userId];

    if (month) {
      sql += " AND month = ?";
      params.push(month);
    }

    sql += " ORDER BY month DESC, id DESC";
    const budgets = await all(sql, params);

    res.json({
      success: true,
      data: budgets,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
