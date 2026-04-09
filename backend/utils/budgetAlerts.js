const { all } = require("../config/db");

const ALERT_THRESHOLD_RATIO = 0.8;
const ALERT_THRESHOLD_PERCENT = Math.round(ALERT_THRESHOLD_RATIO * 100);

function currentMonthValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function normalizeMonth(value) {
  const month = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(month) ? month : currentMonthValue();
}

function severityRank(severity) {
  return severity === "danger" ? 2 : severity === "warning" ? 1 : 0;
}

function buildBudgetAlert(budget, spent, month) {
  const category = String(budget?.category || "Other");
  const limit = Number(budget?.limit_amount ?? budget?.limitAmount ?? 0);
  const numericSpent = Number(spent || 0);

  if (!Number.isFinite(limit) || limit <= 0) {
    return null;
  }

  const progress = (numericSpent / limit) * 100;
  if (progress < ALERT_THRESHOLD_PERCENT) {
    return null;
  }

  const remaining = limit - numericSpent;
  const severity = numericSpent >= limit ? "danger" : "warning";

  return {
    category,
    month,
    limit,
    spent: numericSpent,
    remaining,
    progress,
    severity,
  };
}

async function getBudgetAlerts({ userId, month }) {
  const targetMonth = normalizeMonth(month);
  const budgets = await all(
    `
      SELECT id, category, limit_amount, month
      FROM budgets
      WHERE user_id = ? AND month = ?
      ORDER BY category ASC
    `,
    [userId, targetMonth]
  );

  const spendRows = await all(
    `
      SELECT category, COALESCE(SUM(amount), 0) AS spent
      FROM expenses
      WHERE user_id = ? AND substr(date, 1, 7) = ?
      GROUP BY category
    `,
    [userId, targetMonth]
  );

  const spendByCategory = spendRows.reduce((map, row) => {
    map.set(String(row.category || "Other"), Number(row.spent || 0));
    return map;
  }, new Map());

  const alerts = budgets
    .map((budget) => buildBudgetAlert(budget, spendByCategory.get(String(budget.category || "Other")), targetMonth))
    .filter(Boolean)
    .sort((first, second) => {
      const severityDifference = severityRank(second.severity) - severityRank(first.severity);
      if (severityDifference !== 0) {
        return severityDifference;
      }

      return second.progress - first.progress || first.category.localeCompare(second.category);
    });

  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;
  const dangerCount = alerts.filter((alert) => alert.severity === "danger").length;

  return {
    month: targetMonth,
    thresholdPercent: ALERT_THRESHOLD_PERCENT,
    totalBudgetCount: budgets.length,
    alertCount: alerts.length,
    warningCount,
    dangerCount,
    alerts,
  };
}

module.exports = {
  ALERT_THRESHOLD_PERCENT,
  currentMonthValue,
  normalizeMonth,
  getBudgetAlerts,
};
