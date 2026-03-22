const express = require("express");

const authMiddleware = require("../middleware/auth");
const { all, get, run } = require("../config/db");

const router = express.Router();

router.use(authMiddleware);

function parseSort(sortValue) {
  return String(sortValue || "").toLowerCase() === "oldest" ? "ASC" : "DESC";
}

router.get("/", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    const sort = parseSort(req.query.sort);

    let sql = `
      SELECT id, user_id, title, amount, category, date, payment, notes
      FROM expenses
      WHERE user_id = ?
    `;
    const params = [userId];

    if (search) {
      sql += `
        AND (
          title LIKE ?
          OR category LIKE ?
          OR payment LIKE ?
          OR notes LIKE ?
          OR date LIKE ?
        )
      `;
      const likeValue = `%${search}%`;
      params.push(likeValue, likeValue, likeValue, likeValue, likeValue);
    }

    if (category && category.toLowerCase() !== "all") {
      sql += " AND category = ?";
      params.push(category);
    }

    sql += ` ORDER BY date ${sort}, id ${sort}`;
    const expenses = await all(sql, params);

    res.json({
      success: true,
      data: expenses,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/analytics", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const expenseRow = await get(
      "SELECT COALESCE(SUM(amount), 0) AS total_expense FROM expenses WHERE user_id = ?",
      [userId]
    );
    const userRow = await get(
      "SELECT COALESCE(monthly_income, 0) AS monthly_income FROM users WHERE id = ?",
      [userId]
    );

    const totalExpense = Number(expenseRow?.total_expense || 0);
    const totalIncome = Number(userRow?.monthly_income || 0);
    const balance = totalIncome - totalExpense;

    res.json({
      success: true,
      data: {
        totalIncome,
        totalExpense,
        balance,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/export/csv", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const expenses = await all(
      `
        SELECT date, title, category, amount, payment, notes
        FROM expenses
        WHERE user_id = ?
        ORDER BY date DESC, id DESC
      `,
      [userId]
    );

    const rows = [
      ["Date", "Title", "Category", "Amount", "Payment", "Notes"],
      ...expenses.map((expense) => [
        expense.date || "",
        expense.title || "",
        expense.category || "",
        String(expense.amount || 0),
        expense.payment || "",
        (expense.notes || "").replace(/\n/g, " "),
      ]),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="expenses-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const title = String(req.body.title || "").trim();
    const amount = Number(req.body.amount || 0);
    const category = String(req.body.category || "").trim();
    const date = String(req.body.date || "").trim();
    const payment = String(req.body.payment || "").trim();
    const notes = String(req.body.notes || "").trim();

    if (!title || !category || !date || !payment || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({
        success: false,
        message: "Invalid expense payload",
      });
      return;
    }

    const insertResult = await run(
      `
        INSERT INTO expenses (user_id, title, amount, category, date, payment, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [userId, title, amount, category, date, payment, notes]
    );

    const expense = await get(
      `
        SELECT id, user_id, title, amount, category, date, payment, notes
        FROM expenses
        WHERE id = ?
      `,
      [insertResult.id]
    );

    res.status(201).json({
      success: true,
      message: "Expense created",
      data: expense,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const expenseId = Number(req.params.id);
    const title = String(req.body.title || "").trim();
    const amount = Number(req.body.amount || 0);
    const category = String(req.body.category || "").trim();
    const date = String(req.body.date || "").trim();
    const payment = String(req.body.payment || "").trim();
    const notes = String(req.body.notes || "").trim();

    if (!expenseId || !title || !category || !date || !payment || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({
        success: false,
        message: "Invalid expense payload",
      });
      return;
    }

    const updateResult = await run(
      `
        UPDATE expenses
        SET title = ?, amount = ?, category = ?, date = ?, payment = ?, notes = ?
        WHERE id = ? AND user_id = ?
      `,
      [title, amount, category, date, payment, notes, expenseId, userId]
    );

    if (!updateResult.changes) {
      res.status(404).json({
        success: false,
        message: "Expense not found",
      });
      return;
    }

    const expense = await get(
      `
        SELECT id, user_id, title, amount, category, date, payment, notes
        FROM expenses
        WHERE id = ?
      `,
      [expenseId]
    );

    res.json({
      success: true,
      message: "Expense updated",
      data: expense,
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const expenseId = Number(req.params.id);
    if (!expenseId) {
      res.status(400).json({
        success: false,
        message: "Invalid expense id",
      });
      return;
    }

    const deleteResult = await run(
      "DELETE FROM expenses WHERE id = ? AND user_id = ?",
      [expenseId, userId]
    );

    if (!deleteResult.changes) {
      res.status(404).json({
        success: false,
        message: "Expense not found",
      });
      return;
    }

    res.json({
      success: true,
      message: "Expense deleted",
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
