(() => {
  const app = window.ExpenseApp || {};
  let dashboardCharts = [];
  let reportCharts = [];

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

  function fallbackAvatar(name) {
    const initials = String(name || "ET")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");

    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='88' height='88'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop offset='0%' stop-color='#2f6bff'/><stop offset='100%' stop-color='#11b981'/></linearGradient></defs><rect width='88' height='88' rx='44' fill='url(#g)'/><text x='50%' y='56%' text-anchor='middle' font-family='Arial, sans-serif' font-size='30' fill='white'>${initials || "ET"}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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
    const darkModeToggle = document.getElementById("darkModeToggle");
    const avatarInput = document.getElementById("avatarUrl");

    const nameField = formControl(profileForm, "name");
    const emailField = formControl(profileForm, "email");
    const avatarField = formControl(profileForm, "avatar");
    const currencyField = formControl(profileForm, "currency");
    const monthlyIncomeField = formControl(profileForm, "monthlyIncome");

    function updateAvatarPreview(name, url) {
      if (!avatarPreview) {
        return;
      }
      avatarPreview.src = url || fallbackAvatar(name);
    }

    try {
      const profile = await app.fetchProfile?.();
      if (nameField) nameField.value = profile.name || "";
      if (emailField) emailField.value = profile.email || "";
      if (avatarField) avatarField.value = profile.avatar || "";
      if (currencyField) currencyField.value = profile.currency || "INR";
      if (monthlyIncomeField) monthlyIncomeField.value = String(Number(profile.monthlyIncome || 0));
      if (darkModeToggle) darkModeToggle.checked = Boolean(profile.darkMode);
      updateAvatarPreview(profile.name, profile.avatar);
    } catch (error) {
      app.showFormMessage?.(profileMessage, error.message, "error");
    }

    avatarInput?.addEventListener("input", () => {
      updateAvatarPreview(nameField?.value, avatarInput.value.trim());
    });

    darkModeToggle?.addEventListener("change", () => {
      app.setTheme?.(darkModeToggle.checked);
    });

    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      app.clearFormErrors?.(profileForm);
      app.showFormMessage?.(profileMessage, "", "");

      const name = String(nameField?.value || "").trim();
      const email = String(emailField?.value || "").trim().toLowerCase();
      const avatar = String(avatarField?.value || "").trim();
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
        await app.updateProfile?.({
          name,
          email,
          avatar,
          currency,
          darkMode: Boolean(darkModeToggle?.checked),
          monthlyIncome,
        });
        updateAvatarPreview(name, avatar);
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
    await initDashboardPage();
    await initReportsPage();
    await initProfilePage();
  });
})();
