const express = require("express");

const authMiddleware = require("../middleware/auth");
const { all, get, run } = require("../config/db");
const { getBudgetAlerts } = require("../utils/budgetAlerts");
const {
  createExpenseAddedNotification,
  syncBudgetAlertNotifications,
} = require("../utils/notifications");

const router = express.Router();

router.use(authMiddleware);

function parseSort(sortValue) {
  return String(sortValue || "").toLowerCase() === "oldest" ? "ASC" : "DESC";
}

function parseYear(value) {
  const year = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    return null;
  }

  return year;
}

function parseMonth(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return {
    value: text,
    year,
    month,
  };
}

function formatMonthValue(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year, month, options = {}) {
  const formatOptions = {
    month: options.short ? "short" : "long",
    timeZone: "UTC",
  };

  if (options.includeYear !== false) {
    formatOptions.year = "numeric";
  }

  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", formatOptions);
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

router.get("/summary", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const requestedYear = parseYear(req.query.year);
    const requestedMonth = parseMonth(req.query.month);

    const availableYearRows = await all(
      `
        SELECT DISTINCT CAST(strftime('%Y', date) AS INTEGER) AS year
        FROM expenses
        WHERE user_id = ?
          AND strftime('%Y', date) IS NOT NULL
        ORDER BY year DESC
      `,
      [userId]
    );

    const availableYears = availableYearRows
      .map((row) => Number(row.year))
      .filter((year) => Number.isInteger(year));

    const selectedYear = requestedYear || availableYears[0] || currentYear;
    const selectedYearText = String(selectedYear);

    const monthlyRows = await all(
      `
        SELECT
          CAST(strftime('%m', date) AS INTEGER) AS month,
          COALESCE(SUM(amount), 0) AS total,
          COUNT(*) AS count
        FROM expenses
        WHERE user_id = ?
          AND strftime('%Y', date) = ?
        GROUP BY strftime('%m', date)
        ORDER BY strftime('%m', date) ASC
      `,
      [userId, selectedYearText]
    );

    let selectedMonthNumber = currentMonth;
    if (requestedMonth && requestedMonth.year === selectedYear) {
      selectedMonthNumber = requestedMonth.month;
    } else if (selectedYear !== currentYear) {
      selectedMonthNumber = monthlyRows.length
        ? Number(monthlyRows[monthlyRows.length - 1].month || 1)
        : 1;
    }

    const monthlyMap = new Map(
      monthlyRows.map((row) => [
        Number(row.month),
        {
          total: Number(row.total || 0),
          count: Number(row.count || 0),
        },
      ])
    );

    const monthlyTrend = Array.from({ length: 12 }, (_value, index) => {
      const month = index + 1;
      const monthValue = formatMonthValue(selectedYear, month);
      const totals = monthlyMap.get(month) || { total: 0, count: 0 };

      return {
        month: monthValue,
        label: monthLabel(selectedYear, month, { short: true, includeYear: false }),
        longLabel: monthLabel(selectedYear, month),
        total: totals.total,
        count: totals.count,
      };
    });

    const selectedMonth = formatMonthValue(selectedYear, selectedMonthNumber);
    const selectedMonthSummary =
      monthlyTrend.find((entry) => entry.month === selectedMonth) || monthlyTrend[0];

    const yearTotal = monthlyTrend.reduce((sum, entry) => sum + entry.total, 0);
    const yearTransactionCount = monthlyTrend.reduce((sum, entry) => sum + entry.count, 0);
    const activeMonthCount = monthlyTrend.filter((entry) => entry.total > 0).length;
    const averageActiveMonthSpend = activeMonthCount ? yearTotal / activeMonthCount : 0;

    const highestMonth = monthlyTrend.reduce(
      (best, entry) => (entry.total > best.total ? entry : best),
      { month: "", label: "", longLabel: "", total: 0, count: 0 }
    );

    const previousMonthDate = new Date(Date.UTC(selectedYear, selectedMonthNumber - 2, 1));
    const previousMonthValue = formatMonthValue(
      previousMonthDate.getUTCFullYear(),
      previousMonthDate.getUTCMonth() + 1
    );

    const previousMonthRow = await get(
      `
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM expenses
        WHERE user_id = ?
          AND strftime('%Y-%m', date) = ?
      `,
      [userId, previousMonthValue]
    );

    const previousYearRow = await get(
      `
        SELECT
          COALESCE(SUM(amount), 0) AS total,
          COUNT(*) AS count
        FROM expenses
        WHERE user_id = ?
          AND strftime('%Y', date) = ?
      `,
      [userId, String(selectedYear - 1)]
    );

    const monthCategoryRows = await all(
      `
        SELECT
          category,
          COALESCE(SUM(amount), 0) AS total,
          COUNT(*) AS count
        FROM expenses
        WHERE user_id = ?
          AND strftime('%Y-%m', date) = ?
        GROUP BY category
        ORDER BY total DESC, category ASC
      `,
      [userId, selectedMonth]
    );

    const monthCategories = monthCategoryRows.map((row) => {
      const total = Number(row.total || 0);
      return {
        category: row.category || "Other",
        total,
        count: Number(row.count || 0),
        share: selectedMonthSummary?.total ? (total / selectedMonthSummary.total) * 100 : 0,
      };
    });

    const recentTransactions = await all(
      `
        SELECT id, title, amount, category, date, payment, notes
        FROM expenses
        WHERE user_id = ?
          AND strftime('%Y-%m', date) = ?
        ORDER BY date DESC, id DESC
        LIMIT 6
      `,
      [userId, selectedMonth]
    );

    const yearlyRows = await all(
      `
        SELECT
          CAST(strftime('%Y', date) AS INTEGER) AS year,
          COALESCE(SUM(amount), 0) AS total,
          COUNT(*) AS count
        FROM expenses
        WHERE user_id = ?
          AND strftime('%Y', date) IS NOT NULL
        GROUP BY strftime('%Y', date)
        ORDER BY year ASC
      `,
      [userId]
    );

    const yearlyMap = new Map(
      yearlyRows
        .map((row) => [Number(row.year), row])
        .filter(([year]) => Number.isInteger(year))
    );

    if (!yearlyMap.has(selectedYear)) {
      yearlyMap.set(selectedYear, {
        year: selectedYear,
        total: 0,
        count: 0,
      });
    }

    const yearlyTrend = Array.from(yearlyMap.values())
      .map((row) => ({
        year: Number(row.year),
        label: String(row.year),
        total: Number(row.total || 0),
        count: Number(row.count || 0),
      }))
      .sort((first, second) => first.year - second.year);

    const normalizedYears = Array.from(
      new Set([selectedYear, currentYear, ...availableYears].filter((year) => Number.isInteger(year)))
    ).sort((first, second) => second - first);

    const previousMonthTotal = Number(previousMonthRow?.total || 0);
    const previousYearTotal = Number(previousYearRow?.total || 0);
    const previousYearCount = Number(previousYearRow?.count || 0);

    res.json({
      success: true,
      data: {
        filters: {
          availableYears: normalizedYears,
          selectedYear,
          selectedMonth,
          selectedMonthLabel: monthLabel(selectedYear, selectedMonthNumber),
          selectedYearLabel: String(selectedYear),
        },
        overview: {
          monthTotal: Number(selectedMonthSummary?.total || 0),
          monthTransactionCount: Number(selectedMonthSummary?.count || 0),
          yearTotal,
          yearTransactionCount,
          activeMonthCount,
          averageActiveMonthSpend,
          highestMonth:
            highestMonth.total > 0
              ? {
                  month: highestMonth.month,
                  label: highestMonth.longLabel || highestMonth.label,
                  total: highestMonth.total,
                  count: highestMonth.count,
                }
              : null,
        },
        comparisons: {
          previousMonth: {
            month: previousMonthValue,
            total: previousMonthTotal,
            delta: Number(selectedMonthSummary?.total || 0) - previousMonthTotal,
          },
          previousYear: {
            year: selectedYear - 1,
            total: previousYearTotal,
            count: previousYearCount,
            delta: yearTotal - previousYearTotal,
          },
        },
        monthlyTrend,
        yearlyTrend,
        monthCategories,
        recentTransactions,
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

    const targetMonth = date.slice(0, 7);
    const previousAlertsData = await getBudgetAlerts({
      userId,
      month: targetMonth,
    });

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

    await createExpenseAddedNotification({
      userId,
      expense,
    });
    await syncBudgetAlertNotifications({
      userId,
      month: targetMonth,
      previousAlertsData,
    });

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

    const existingExpense = await get(
      `
        SELECT id, user_id, title, amount, category, date, payment, notes
        FROM expenses
        WHERE id = ? AND user_id = ?
      `,
      [expenseId, userId]
    );

    if (!existingExpense) {
      res.status(404).json({
        success: false,
        message: "Expense not found",
      });
      return;
    }

    const affectedMonths = Array.from(
      new Set([String(existingExpense.date || "").slice(0, 7), date.slice(0, 7)].filter(Boolean))
    );
    const previousAlertsByMonth = new Map();
    for (const monthValue of affectedMonths) {
      previousAlertsByMonth.set(
        monthValue,
        await getBudgetAlerts({
          userId,
          month: monthValue,
        })
      );
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

    for (const monthValue of affectedMonths) {
      await syncBudgetAlertNotifications({
        userId,
        month: monthValue,
        previousAlertsData: previousAlertsByMonth.get(monthValue),
      });
    }

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
