(() => {
  const app = window.ExpenseApp || {};
  let dashboardCharts = [];
  let reportCharts = [];
  let dashboardMetricNodes = [];
  let metricFitFrame = 0;
  let metricResizeBound = false;
  let notificationPollHandle = 0;

  function fitMetricValue(node) {
    if (!node) {
      return;
    }

    node.classList.remove("metric-wrap");
    node.style.fontSize = "";

    const minFontSize = 17;
    let fontSize = parseFloat(window.getComputedStyle(node).fontSize) || 16;

    while (node.scrollWidth > node.clientWidth && fontSize > minFontSize) {
      fontSize -= 1;
      node.style.fontSize = `${fontSize}px`;
    }

    if (node.scrollWidth > node.clientWidth) {
      node.classList.add("metric-wrap");
    }
  }

  function fitDashboardMetrics() {
    dashboardMetricNodes.forEach((node) => fitMetricValue(node));
  }

  function scheduleMetricFit() {
    if (metricFitFrame) {
      cancelAnimationFrame(metricFitFrame);
    }

    metricFitFrame = requestAnimationFrame(() => {
      metricFitFrame = 0;
      fitDashboardMetrics();
    });
  }

  function byNewestDate(a, b) {
    return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
  }

  function sumAmounts(expenses) {
    return expenses.reduce((total, expense) => total + (Number(expense.amount) || 0), 0);
  }

  function monthBuckets(expenses, monthCount) {
    const now = new Date();
    const months = [];
    const totals = [];

    for (let index = monthCount - 1; index >= 0; index -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const label = date.toLocaleDateString("en-IN", { month: "short" });
      months.push({ key, label });
      totals.push(0);
    }

    expenses.forEach((expense) => {
      const date = new Date(expense.date);
      if (Number.isNaN(date.getTime())) {
        return;
      }

      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const bucketIndex = months.findIndex((bucket) => bucket.key === key);
      if (bucketIndex >= 0) {
        totals[bucketIndex] += Number(expense.amount) || 0;
      }
    });

    return {
      labels: months.map((bucket) => bucket.label),
      totals,
    };
  }

  function categoryBuckets(expenses) {
    const map = new Map();
    expenses.forEach((expense) => {
      const category = expense.category || "Other";
      const amount = Number(expense.amount) || 0;
      map.set(category, (map.get(category) || 0) + amount);
    });

    return {
      labels: Array.from(map.keys()),
      totals: Array.from(map.values()),
    };
  }

  function destroyCharts(list) {
    list.forEach((chart) => chart?.destroy?.());
    return [];
  }

  function alertCountLabel(count) {
    return count ? `${count} active alert${count === 1 ? "" : "s"}` : "No active alerts";
  }

  function alertSeverityLabel(severity) {
    return severity === "danger" ? "Over budget" : "Near limit";
  }

  function renderDashboardAlerts(listNode, countNode, alertsData, currency) {
    if (!listNode) {
      return;
    }

    const alerts = Array.isArray(alertsData?.alerts) ? alertsData.alerts : [];
    listNode.innerHTML = "";

    if (countNode) {
      countNode.textContent = alertCountLabel(Number(alertsData?.alertCount || 0));
    }

    if (!alerts.length) {
      listNode.innerHTML = '<div class="empty-state">No budget alerts right now. Your tracked categories are within a safe range.</div>';
      return;
    }

    alerts.slice(0, 3).forEach((alert) => {
      const card = document.createElement("article");
      card.className = `budget-alert-card ${alert.severity || "warning"}`;

      const head = document.createElement("div");
      head.className = "budget-alert-head";

      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = `${alert.category} needs attention`;
      const body = document.createElement("p");
      body.textContent = app.describeBudgetAlert?.(alert, currency) || "";
      copy.append(title, body);

      const status = document.createElement("span");
      status.className = `budget-status ${alert.severity || "warning"}`;
      status.textContent = alertSeverityLabel(alert.severity);
      head.append(copy, status);

      const progressRow = document.createElement("div");
      progressRow.className = "budget-alert-progress-row";

      const progressTrack = document.createElement("div");
      progressTrack.className = "budget-progress";

      const progressBar = document.createElement("span");
      progressBar.className = `budget-progress-bar ${alert.severity || "warning"}`;
      progressBar.style.width = `${Math.min(Math.max(Number(alert.progress || 0), 0), 100)}%`;
      progressTrack.appendChild(progressBar);

      const progressValue = document.createElement("strong");
      progressValue.textContent = `${Math.round(Number(alert.progress || 0))}% used`;
      progressRow.append(progressTrack, progressValue);

      card.append(head, progressRow);
      listNode.appendChild(card);
    });

    if (alerts.length > 3) {
      const note = document.createElement("div");
      note.className = "empty-state";
      note.textContent = `${alerts.length - 3} more alert${alerts.length - 3 === 1 ? "" : "s"} available in Budget Planner.`;
      listNode.appendChild(note);
    }
  }

  function relativeTimeLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Just now";
    }

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(Math.round(diffMs / 60000), 0);
    if (diffMinutes < 1) {
      return "Just now";
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
    }

    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
    }

    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function notificationVariant(type) {
    if (type === "budget-exceeded") {
      return { tone: "danger", label: "Exceeded" };
    }
    if (type === "budget-warning") {
      return { tone: "warning", label: "Alert" };
    }
    return { tone: "success", label: "Expense" };
  }

  function notificationSummary(unreadCount, totalCount) {
    const unread = Number(unreadCount || 0);
    const total = Number(totalCount || 0);
    if (!total) {
      return "No notifications yet";
    }
    if (!unread) {
      return `${total} notification${total === 1 ? "" : "s"} | all caught up`;
    }
    return `${unread} unread of ${total} notification${total === 1 ? "" : "s"}`;
  }

  function renderNotifications(listNode, badgeNode, metaNode, markAllButton, payload) {
    if (!listNode) {
      return;
    }

    const notifications = Array.isArray(payload?.notifications) ? payload.notifications : [];
    const unreadCount = Number(payload?.unreadCount || 0);

    if (badgeNode) {
      badgeNode.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      badgeNode.classList.toggle("hidden-state", unreadCount < 1);
    }

    if (metaNode) {
      metaNode.textContent = notificationSummary(unreadCount, notifications.length);
    }

    if (markAllButton) {
      markAllButton.disabled = unreadCount < 1;
    }

    listNode.innerHTML = "";
    if (!notifications.length) {
      listNode.innerHTML = '<div class="empty-state">You do not have any notifications yet.</div>';
      return;
    }

    notifications.forEach((item) => {
      const variant = notificationVariant(item.type);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `notification-item ${variant.tone}${item.isRead ? "" : " unread"}`;
      button.setAttribute("data-notification-id", String(item.id));

      const head = document.createElement("div");
      head.className = "notification-item-head";

      const title = document.createElement("strong");
      title.textContent = item.title || "Notification";

      const tag = document.createElement("span");
      tag.className = `notification-tag ${variant.tone}`;
      tag.textContent = variant.label;
      head.append(title, tag);

      const body = document.createElement("p");
      body.textContent = item.message || "";

      const time = document.createElement("span");
      time.className = "notification-time";
      time.textContent = relativeTimeLabel(item.createdAt);

      button.append(head, body, time);
      listNode.appendChild(button);
    });
  }

  async function initNotificationCenter() {
    const shell = document.getElementById("dashboardNotificationShell");
    if (!shell) {
      return;
    }

    const toggleButton = document.getElementById("notificationToggleBtn");
    const panel = document.getElementById("notificationPanel");
    const listNode = document.getElementById("notificationList");
    const metaNode = document.getElementById("notificationPanelMeta");
    const badgeNode = document.getElementById("notificationUnreadBadge");
    const markAllButton = document.getElementById("markAllNotificationsBtn");
    let currentPayload = {
      unreadCount: 0,
      notifications: [],
    };

    async function loadNotifications(options = {}) {
      const silent = Boolean(options.silent);

      try {
        const payload = await app.fetchNotifications?.({ limit: 12 });
        currentPayload = payload && typeof payload === "object"
          ? payload
          : { unreadCount: 0, notifications: [] };
        renderNotifications(listNode, badgeNode, metaNode, markAllButton, currentPayload);
      } catch (error) {
        if (!silent && listNode) {
          listNode.innerHTML = `<div class="empty-state">${error.message}</div>`;
        }
        if (metaNode && !silent) {
          metaNode.textContent = "Notifications unavailable";
        }
      }
    }

    function openPanel() {
      panel?.classList.remove("hidden-state");
      toggleButton?.setAttribute("aria-expanded", "true");
    }

    function closePanel() {
      panel?.classList.add("hidden-state");
      toggleButton?.setAttribute("aria-expanded", "false");
    }

    toggleButton?.addEventListener("click", async (event) => {
      event.stopPropagation();
      const isClosed = panel?.classList.contains("hidden-state");
      if (isClosed) {
        openPanel();
        await loadNotifications();
        return;
      }

      closePanel();
    });

    document.addEventListener("click", (event) => {
      if (!shell.contains(event.target)) {
        closePanel();
      }
    });

    panel?.addEventListener("click", async (event) => {
      const itemButton = event.target.closest("[data-notification-id]");
      if (!itemButton) {
        return;
      }

      const notificationId = Number(itemButton.getAttribute("data-notification-id"));
      if (!notificationId) {
        return;
      }

      itemButton.disabled = true;
      try {
        await app.markNotificationRead?.(notificationId);
        currentPayload.notifications = (currentPayload.notifications || []).map((notification) =>
          Number(notification.id) === notificationId
            ? { ...notification, isRead: true }
            : notification
        );
        currentPayload.unreadCount = Math.max(Number(currentPayload.unreadCount || 0) - 1, 0);
        renderNotifications(listNode, badgeNode, metaNode, markAllButton, currentPayload);
      } catch (error) {
        itemButton.disabled = false;
      }
    });

    markAllButton?.addEventListener("click", async () => {
      markAllButton.disabled = true;
      try {
        await app.markAllNotificationsRead?.();
        currentPayload = {
          ...currentPayload,
          unreadCount: 0,
          notifications: (currentPayload.notifications || []).map((notification) => ({
            ...notification,
            isRead: true,
          })),
        };
        renderNotifications(listNode, badgeNode, metaNode, markAllButton, currentPayload);
      } catch (error) {
        markAllButton.disabled = false;
      } finally {
        if (markAllButton && Number(currentPayload.unreadCount || 0) > 0) {
          markAllButton.disabled = false;
        }
      }
    });

    await loadNotifications({ silent: true });
    if (notificationPollHandle) {
      window.clearInterval(notificationPollHandle);
    }
    notificationPollHandle = window.setInterval(() => {
      loadNotifications({ silent: true });
    }, 30000);
  }

  function initSidebar() {
    const sidebar = document.getElementById("appSidebar");
    const menuButton = document.getElementById("mobileSidebarToggle");
    const page = document.body.dataset.page;
    const dateNode = document.getElementById("topbarDate");

    if (dateNode) {
      dateNode.textContent = new Date().toLocaleDateString("en-IN", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    document.querySelectorAll(".side-link[data-nav]").forEach((node) => {
      node.classList.toggle("active", node.getAttribute("data-nav") === page);
    });

    if (menuButton && sidebar) {
      menuButton.addEventListener("click", () => {
        sidebar.classList.toggle("is-open");
      });

      document.addEventListener("click", (event) => {
        const clickedInsideSidebar = sidebar.contains(event.target);
        const clickedMenuButton = menuButton.contains(event.target);
        if (!clickedInsideSidebar && !clickedMenuButton) {
          sidebar.classList.remove("is-open");
        }
      });
    }

    app.refreshUserUi?.();
  }

  async function initDashboardPage() {
    const balanceNode = document.getElementById("metricBalance");
    if (!balanceNode) {
      return;
    }

    const incomeNode = document.getElementById("metricIncome");
    const expenseNode = document.getElementById("metricExpenses");
    const monthlyNode = document.getElementById("metricMonthly");
    const listNode = document.getElementById("recentTransactionsList");
    const alertListNode = document.getElementById("dashboardBudgetAlerts");
    const alertCountNode = document.getElementById("dashboardBudgetAlertCount");
    dashboardMetricNodes = [balanceNode, incomeNode, expenseNode, monthlyNode].filter(Boolean);

    if (!metricResizeBound) {
      window.addEventListener("resize", scheduleMetricFit);
      metricResizeBound = true;
    }

    try {
      const [expenses, analytics] = await Promise.all([
        app.fetchExpenses?.() || [],
        app.fetchExpenseAnalytics?.() || { totalIncome: 0, totalExpense: 0, balance: 0 },
      ]);

      const settings = app.getSettings?.() || {};
      const currency = settings.currency || "INR";

      const now = new Date();
      const monthlySpending = expenses
        .filter((item) => {
          const date = new Date(item.date);
          return (
            !Number.isNaN(date.getTime()) &&
            date.getMonth() === now.getMonth() &&
            date.getFullYear() === now.getFullYear()
          );
        })
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

      balanceNode.textContent = app.formatCurrency(analytics.balance || 0, currency);
      incomeNode.textContent = app.formatCurrency(analytics.totalIncome || 0, currency);
      expenseNode.textContent = app.formatCurrency(analytics.totalExpense || 0, currency);
      monthlyNode.textContent = app.formatCurrency(monthlySpending, currency);
      scheduleMetricFit();

      if (listNode) {
        const recent = [...expenses].sort(byNewestDate).slice(0, 6);
        listNode.innerHTML = "";
        if (!recent.length) {
          listNode.innerHTML = '<li class="empty-state">No transactions yet. Add your first expense.</li>';
        } else {
          recent.forEach((item) => {
            const row = document.createElement("li");
            row.className = "transaction-item";
            row.innerHTML = `
              <div>
                <h4>${item.title}</h4>
                <p>${item.category} | ${item.date || "No date"}</p>
              </div>
              <strong>${app.formatCurrency(item.amount, currency)}</strong>
            `;
            listNode.appendChild(row);
          });
        }
      }

      try {
        const alertsData = await app.fetchBudgetAlerts?.({
          month: app.currentMonthValue?.(),
        });
        renderDashboardAlerts(alertListNode, alertCountNode, alertsData, currency);
      } catch (error) {
        if (alertCountNode) {
          alertCountNode.textContent = "Alerts unavailable";
        }
        if (alertListNode) {
          alertListNode.innerHTML = `<div class="empty-state">${error.message}</div>`;
        }
      }

      if (!window.Chart) {
        return;
      }

      dashboardCharts = destroyCharts(dashboardCharts);
      const categoryCanvas = document.getElementById("dashboardCategoryChart");
      const monthlyCanvas = document.getElementById("dashboardMonthlyChart");

      if (categoryCanvas) {
        const grouped = categoryBuckets(expenses);
        dashboardCharts.push(
          new Chart(categoryCanvas, {
            type: "pie",
            data: {
              labels: grouped.labels.length ? grouped.labels : ["No Data"],
              datasets: [
                {
                  data: grouped.totals.length ? grouped.totals : [1],
                  backgroundColor: ["#2f6bff", "#11b981", "#34d399", "#60a5fa", "#22c55e", "#93c5fd"],
                  borderWidth: 1,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  position: "bottom",
                },
              },
            },
          })
        );
      }

      if (monthlyCanvas) {
        const monthlyData = monthBuckets(expenses, 6);
        dashboardCharts.push(
          new Chart(monthlyCanvas, {
            type: "bar",
            data: {
              labels: monthlyData.labels,
              datasets: [
                {
                  label: "Expenses",
                  data: monthlyData.totals,
                  backgroundColor: "#2f6bff",
                  borderRadius: 8,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: { beginAtZero: true },
              },
            },
          })
        );
      }

    } catch (error) {
      if (listNode) {
        listNode.innerHTML = `<li class="empty-state">${error.message}</li>`;
      }
      if (alertCountNode) {
        alertCountNode.textContent = "Alerts unavailable";
      }
      if (alertListNode) {
        alertListNode.innerHTML = `<div class="empty-state">${error.message}</div>`;
      }
    }
  }

  async function initReportsPage() {
    const trendCanvas = document.getElementById("reportTrendChart");
    if (!trendCanvas) {
      return;
    }

    const startInput = document.getElementById("reportStart");
    const endInput = document.getElementById("reportEnd");
    const applyButton = document.getElementById("applyReportFilter");
    const exportButton = document.getElementById("exportCsvBtn");
    const totalNode = document.getElementById("reportTotalSpent");
    const averageNode = document.getElementById("reportAverageSpent");
    const countNode = document.getElementById("reportTotalCount");

    const today = new Date();
    const defaultEnd = today.toISOString().slice(0, 10);
    const defaultStartDate = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const defaultStart = defaultStartDate.toISOString().slice(0, 10);

    if (startInput && !startInput.value) {
      startInput.value = defaultStart;
    }
    if (endInput && !endInput.value) {
      endInput.value = defaultEnd;
    }

    let expenses = [];
    try {
      expenses = await app.fetchExpenses?.();
    } catch (error) {
      expenses = [];
    }

    function getFilteredExpenses() {
      const startDate = startInput?.value ? new Date(startInput.value) : null;
      const endDate = endInput?.value ? new Date(`${endInput.value}T23:59:59`) : null;

      return expenses.filter((expense) => {
        const date = new Date(expense.date);
        if (Number.isNaN(date.getTime())) {
          return false;
        }
        if (startDate && date < startDate) {
          return false;
        }
        if (endDate && date > endDate) {
          return false;
        }
        return true;
      });
    }

    function renderReportCharts(filteredExpenses) {
      const currency = app.getSettings?.().currency || "INR";
      const totalSpent = sumAmounts(filteredExpenses);
      const count = filteredExpenses.length;
      const average = count ? totalSpent / count : 0;

      if (totalNode) totalNode.textContent = app.formatCurrency(totalSpent, currency);
      if (averageNode) averageNode.textContent = app.formatCurrency(average, currency);
      if (countNode) countNode.textContent = String(count);

      if (!window.Chart) {
        return;
      }

      reportCharts = destroyCharts(reportCharts);
      const trendData = monthBuckets(filteredExpenses, 6);
      const categoryData = categoryBuckets(filteredExpenses);
      const monthlyIncome = Number(app.getSettings?.().monthlyIncome || 0);
      const incomeSeries = trendData.labels.map(() => monthlyIncome);

      reportCharts.push(
        new Chart(trendCanvas, {
          type: "line",
          data: {
            labels: trendData.labels,
            datasets: [
              {
                label: "Expenses",
                data: trendData.totals,
                borderColor: "#2f6bff",
                backgroundColor: "rgba(47,107,255,0.2)",
                fill: true,
                tension: 0.35,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
          },
        })
      );

      const categoryCanvas = document.getElementById("reportCategoryChart");
      if (categoryCanvas) {
        reportCharts.push(
          new Chart(categoryCanvas, {
            type: "pie",
            data: {
              labels: categoryData.labels.length ? categoryData.labels : ["No Data"],
              datasets: [
                {
                  data: categoryData.totals.length ? categoryData.totals : [1],
                  backgroundColor: ["#2f6bff", "#11b981", "#34d399", "#60a5fa", "#22c55e", "#93c5fd"],
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: "bottom" },
              },
            },
          })
        );
      }

      const incomeExpenseCanvas = document.getElementById("reportIncomeExpenseChart");
      if (incomeExpenseCanvas) {
        reportCharts.push(
          new Chart(incomeExpenseCanvas, {
            type: "line",
            data: {
              labels: trendData.labels,
              datasets: [
                {
                  label: "Income",
                  data: incomeSeries,
                  borderColor: "#11b981",
                  backgroundColor: "rgba(17,185,129,0.16)",
                  fill: false,
                  tension: 0.35,
                },
                {
                  label: "Expense",
                  data: trendData.totals,
                  borderColor: "#2f6bff",
                  backgroundColor: "rgba(47,107,255,0.16)",
                  fill: false,
                  tension: 0.35,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
            },
          })
        );
      }
    }

    let latestFiltered = getFilteredExpenses();
    renderReportCharts(latestFiltered);

    applyButton?.addEventListener("click", () => {
      latestFiltered = getFilteredExpenses();
      renderReportCharts(latestFiltered);
    });

    exportButton?.addEventListener("click", () => {
      const rows = [
        ["Date", "Title", "Category", "Amount", "Payment", "Notes"],
        ...latestFiltered.map((expense) => [
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
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `expense-report-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });
  }

  function normalizeAvatarValue(value) {
    return String(value || "").trim();
  }

  function formControl(form, name) {
    return form?.elements?.namedItem(name);
  }

  async function initProfilePage() {
    const profileForm = document.getElementById("profileForm");
    if (!profileForm) {
      return;
    }

    const passwordForm = document.getElementById("passwordForm");
    const profileMessage = document.getElementById("profileMessage");
    const passwordMessage = document.getElementById("passwordMessage");
    const avatarPreview = document.getElementById("avatarPreview");
    const avatarPicker = document.getElementById("avatarPicker");
    const avatarHint = document.getElementById("avatarPickerHint");
    const darkModeToggle = document.getElementById("darkModeToggle");

    const nameField = formControl(profileForm, "name");
    const emailField = formControl(profileForm, "email");
    const avatarField = formControl(profileForm, "avatar");
    const currencyField = formControl(profileForm, "currency");
    const monthlyIncomeField = formControl(profileForm, "monthlyIncome");
    const avatarPresets = app.getAvatarPresets?.() || [];
    let themeSaveRequestId = 0;

    function selectedAvatarValue() {
      return normalizeAvatarValue(avatarField?.value || "");
    }

    function updateAvatarPreview(name, url, options = {}) {
      if (!avatarPreview) {
        return;
      }

      app.applyAvatarImage?.(avatarPreview, name, url, options);
    }

    function updateAvatarHint(avatarValue) {
      if (!avatarHint) {
        return;
      }

      if (!avatarValue) {
        avatarHint.textContent = "Using initials avatar. Pick any preset if you want a different look.";
        return;
      }

      const matchingPreset = avatarPresets.find((preset) => preset.id === avatarValue);
      if (matchingPreset) {
        avatarHint.textContent = `${matchingPreset.label} selected. Save your profile to keep this avatar.`;
        return;
      }

      avatarHint.textContent = "A previously saved custom avatar is still active. Pick a preset to replace it.";
    }

    function renderAvatarPicker() {
      if (!avatarPicker) {
        return;
      }

      const name = String(nameField?.value || "").trim();
      const selectedAvatar = selectedAvatarValue();
      const choices = [{ id: "", label: "Initials" }, ...avatarPresets];

      avatarPicker.innerHTML = "";
      choices.forEach((choice) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "avatar-option";
        button.setAttribute("data-avatar-choice", choice.id);

        const isSelected = choice.id === selectedAvatar;
        button.classList.toggle("selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));

        const image = document.createElement("img");
        image.alt = `${choice.label} avatar`;
        app.applyAvatarImage?.(image, name, choice.id);

        const label = document.createElement("span");
        label.textContent = choice.label;

        button.append(image, label);
        button.addEventListener("click", () => {
          if (avatarField) {
            avatarField.value = choice.id;
          }
          app.setFieldError?.(profileForm, "avatar", "");
          updateAvatarPreview(nameField?.value, choice.id);
          renderAvatarPicker();
        });

        avatarPicker.appendChild(button);
      });

      updateAvatarHint(selectedAvatar);
    }

    function buildThemeUpdatePayload(enabled) {
      const settings = app.getSettings?.() || {};
      const name = String(nameField?.value || settings.name || "").trim();
      const email = String(emailField?.value || settings.email || "")
        .trim()
        .toLowerCase();
      const avatar = normalizeAvatarValue(avatarField?.value || settings.avatar || "");
      const currency = String(currencyField?.value || settings.currency || "INR")
        .trim()
        .toUpperCase();
      const monthlyIncome = Number(monthlyIncomeField?.value ?? settings.monthlyIncome ?? 0);

      return {
        name,
        email,
        avatar,
        currency: currency || "INR",
        darkMode: Boolean(enabled),
        monthlyIncome: Number.isFinite(monthlyIncome) ? monthlyIncome : 0,
      };
    }

    if (darkModeToggle) {
      darkModeToggle.checked = Boolean(app.getSettings?.().darkMode);
    }

    renderAvatarPicker();
    updateAvatarPreview(nameField?.value, selectedAvatarValue());

    try {
      const profile = await app.fetchProfile?.();
      if (nameField) nameField.value = profile.name || "";
      if (emailField) emailField.value = profile.email || "";
      if (avatarField) avatarField.value = profile.avatar || "";
      if (currencyField) currencyField.value = profile.currency || "INR";
      if (monthlyIncomeField) monthlyIncomeField.value = String(Number(profile.monthlyIncome || 0));
      if (darkModeToggle) darkModeToggle.checked = Boolean(profile.darkMode);
      renderAvatarPicker();
      updateAvatarPreview(profile.name, profile.avatar, {
        onError: () => {
          if (selectedAvatarValue()) {
            app.showFormMessage?.(
              profileMessage,
              "The saved avatar could not be loaded. Pick a preset avatar and save again.",
              "error"
            );
          }
        },
      });
    } catch (error) {
      app.showFormMessage?.(profileMessage, error.message, "error");
    }

    nameField?.addEventListener("input", () => {
      renderAvatarPicker();
      updateAvatarPreview(nameField?.value, selectedAvatarValue());
    });

    darkModeToggle?.addEventListener("change", async () => {
      const nextDarkMode = Boolean(darkModeToggle.checked);
      const previousDarkMode = Boolean(app.getSettings?.().darkMode);
      app.setTheme?.(nextDarkMode);

      const payload = buildThemeUpdatePayload(nextDarkMode);
      if (!payload.name || !payload.email) {
        if (darkModeToggle) {
          darkModeToggle.checked = previousDarkMode;
        }
        app.setTheme?.(previousDarkMode);
        app.showFormMessage?.(profileMessage, "Please save your profile details first.", "error");
        return;
      }

      const requestId = (themeSaveRequestId += 1);
      try {
        await app.updateProfile?.(payload);
        if (requestId !== themeSaveRequestId) {
          return;
        }
        if (darkModeToggle) {
          darkModeToggle.checked = Boolean(app.getSettings?.().darkMode);
        }
        app.showFormMessage?.(profileMessage, "Theme preference saved.", "success");
      } catch (error) {
        if (requestId !== themeSaveRequestId) {
          return;
        }
        if (darkModeToggle) {
          darkModeToggle.checked = previousDarkMode;
        }
        app.setTheme?.(previousDarkMode);
        app.showFormMessage?.(profileMessage, error.message, "error");
      }
    });

    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      app.clearFormErrors?.(profileForm);
      app.showFormMessage?.(profileMessage, "", "");

      const name = String(nameField?.value || "").trim();
      const email = String(emailField?.value || "").trim().toLowerCase();
      const avatar = normalizeAvatarValue(avatarField?.value);
      const currency = String(currencyField?.value || "INR").toUpperCase();
      const monthlyIncome = Number(monthlyIncomeField?.value || 0);

      let hasError = false;
      if (name.length < 3) {
        app.setFieldError?.(profileForm, "name", "Name must be at least 3 characters.");
        hasError = true;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        app.setFieldError?.(profileForm, "email", "Enter a valid email.");
        hasError = true;
      }
      if (!Number.isFinite(monthlyIncome) || monthlyIncome < 0) {
        app.setFieldError?.(profileForm, "monthlyIncome", "Monthly income must be 0 or more.");
        hasError = true;
      }

      if (hasError) {
        app.showFormMessage?.(profileMessage, "Please fix the profile form errors.", "error");
        return;
      }

      try {
        const updatedProfile = await app.updateProfile?.({
          name,
          email,
          avatar,
          currency,
          darkMode: Boolean(darkModeToggle?.checked),
          monthlyIncome,
        });
        if (avatarField) {
          avatarField.value = updatedProfile?.avatar || avatar;
        }
        renderAvatarPicker();
        updateAvatarPreview(updatedProfile?.name || name, updatedProfile?.avatar || avatar);
        app.showFormMessage?.(profileMessage, "Profile updated successfully.", "success");
      } catch (error) {
        app.showFormMessage?.(profileMessage, error.message, "error");
      }
    });

    passwordForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      app.clearFormErrors?.(passwordForm);
      app.showFormMessage?.(passwordMessage, "", "");

      const currentPassword = String(formControl(passwordForm, "currentPassword")?.value || "");
      const newPassword = String(formControl(passwordForm, "newPassword")?.value || "");
      const confirmPassword = String(formControl(passwordForm, "confirmNewPassword")?.value || "");

      let hasError = false;
      if (!currentPassword) {
        app.setFieldError?.(passwordForm, "currentPassword", "Current password is required.");
        hasError = true;
      }
      if (newPassword.length < 8) {
        app.setFieldError?.(passwordForm, "newPassword", "New password must be at least 8 characters.");
        hasError = true;
      }
      if (confirmPassword !== newPassword) {
        app.setFieldError?.(passwordForm, "confirmNewPassword", "Passwords do not match.");
        hasError = true;
      }

      if (hasError) {
        app.showFormMessage?.(passwordMessage, "Please fix the password form errors.", "error");
        return;
      }

      try {
        await app.updatePassword?.({
          currentPassword,
          newPassword,
        });
        passwordForm.reset();
        app.showFormMessage?.(passwordMessage, "Password updated successfully.", "success");
      } catch (error) {
        app.showFormMessage?.(passwordMessage, error.message, "error");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    initSidebar();
    await initNotificationCenter();
    await initDashboardPage();
    await initReportsPage();
    await initProfilePage();
  });
})();
