const { all, get, run } = require("../config/db");
const { getBudgetAlerts } = require("./budgetAlerts");

function serializeMetadata(metadata) {
  try {
    return JSON.stringify(metadata || {});
  } catch (error) {
    return "{}";
  }
}

function parseMetadata(value) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function mapNotificationRow(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    eventKey: row.event_key || "",
    isRead: Boolean(row.is_read),
    metadata: parseMetadata(row.metadata),
    createdAt: row.created_at,
  };
}

function severityRank(severity) {
  return severity === "danger" ? 2 : severity === "warning" ? 1 : 0;
}

function monthLabel(monthValue) {
  const match = String(monthValue || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return String(monthValue || "this month").trim() || "this month";
  }

  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function budgetAlertTitle(alert) {
  return alert?.severity === "danger" ? "Budget exceeded" : "Budget alert";
}

function budgetAlertMessage(alert) {
  const monthText = monthLabel(alert?.month);
  const progress = Math.round(Number(alert?.progress || 0));
  const category = alert?.category || "This category";

  if (alert?.severity === "danger") {
    return `${category} has exceeded its budget in ${monthText}. You have used ${progress}% of the planned limit.`;
  }

  return `${category} has reached ${progress}% of its budget in ${monthText}. Keep an eye on this category.`;
}

async function createNotification({ userId, type, title, message, eventKey = "", metadata = {} }) {
  const normalizedEventKey = String(eventKey || "").trim();
  if (normalizedEventKey) {
    const existing = await get(
      `
        SELECT id, type, title, message, event_key, metadata, is_read, created_at
        FROM notifications
        WHERE user_id = ? AND event_key = ?
      `,
      [userId, normalizedEventKey]
    );

    if (existing) {
      return mapNotificationRow(existing);
    }
  }

  const insertResult = await run(
    `
      INSERT INTO notifications (user_id, type, title, message, event_key, metadata, is_read)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `,
    [userId, type, title, message, normalizedEventKey, serializeMetadata(metadata)]
  );

  const row = await get(
    `
      SELECT id, type, title, message, event_key, metadata, is_read, created_at
      FROM notifications
      WHERE id = ?
    `,
    [insertResult.id]
  );

  return mapNotificationRow(row);
}

async function createExpenseAddedNotification({ userId, expense }) {
  if (!expense?.id) {
    return null;
  }

  return createNotification({
    userId,
    type: "expense-added",
    title: "Expense added",
    message: `${expense.title || "Expense"} was added for ${expense.amount || 0} on ${expense.date || "the selected date"}.`,
    eventKey: `expense:${expense.id}`,
    metadata: {
      expenseId: expense.id,
      category: expense.category || "",
      amount: Number(expense.amount || 0),
      date: expense.date || "",
      payment: expense.payment || "",
    },
  });
}

function alertMap(alertsData) {
  const alerts = Array.isArray(alertsData?.alerts) ? alertsData.alerts : [];
  return alerts.reduce((map, alert) => {
    map.set(`${alert.month}:${alert.category}`, alert);
    return map;
  }, new Map());
}

async function syncBudgetAlertNotifications({ userId, month, previousAlertsData = null }) {
  const targetMonth = String(month || "").trim();
  if (!targetMonth) {
    return null;
  }

  const beforeMap = alertMap(previousAlertsData);
  const nextAlertsData = await getBudgetAlerts({
    userId,
    month: targetMonth,
  });

  const nextAlerts = Array.isArray(nextAlertsData?.alerts) ? nextAlertsData.alerts : [];
  for (const alert of nextAlerts) {
    const key = `${alert.month}:${alert.category}`;
    const previousAlert = beforeMap.get(key);
    if (severityRank(alert.severity) <= severityRank(previousAlert?.severity)) {
      continue;
    }

    await createNotification({
      userId,
      type: alert.severity === "danger" ? "budget-exceeded" : "budget-warning",
      title: budgetAlertTitle(alert),
      message: budgetAlertMessage(alert),
      eventKey: `budget:${alert.month}:${alert.category}:${alert.severity}`,
      metadata: {
        category: alert.category,
        month: alert.month,
        limit: Number(alert.limit || 0),
        spent: Number(alert.spent || 0),
        remaining: Number(alert.remaining || 0),
        progress: Number(alert.progress || 0),
        severity: alert.severity,
      },
    });
  }

  return nextAlertsData;
}

async function listNotifications({ userId, limit = 12 }) {
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 12, 50));
  const rows = await all(
    `
      SELECT id, type, title, message, event_key, metadata, is_read, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY is_read ASC, datetime(created_at) DESC, id DESC
      LIMIT ?
    `,
    [userId, normalizedLimit]
  );

  const unreadRow = await get(
    `
      SELECT COUNT(*) AS unread_count
      FROM notifications
      WHERE user_id = ? AND is_read = 0
    `,
    [userId]
  );

  return {
    unreadCount: Number(unreadRow?.unread_count || 0),
    notifications: rows.map(mapNotificationRow),
  };
}

async function markNotificationRead({ userId, notificationId }) {
  await run(
    `
      UPDATE notifications
      SET is_read = 1
      WHERE id = ? AND user_id = ?
    `,
    [notificationId, userId]
  );

  const row = await get(
    `
      SELECT id, type, title, message, event_key, metadata, is_read, created_at
      FROM notifications
      WHERE id = ? AND user_id = ?
    `,
    [notificationId, userId]
  );

  return row ? mapNotificationRow(row) : null;
}

async function markAllNotificationsRead({ userId }) {
  await run(
    `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ? AND is_read = 0
    `,
    [userId]
  );

  return {
    unreadCount: 0,
  };
}

module.exports = {
  createNotification,
  createExpenseAddedNotification,
  syncBudgetAlertNotifications,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
