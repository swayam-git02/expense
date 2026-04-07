(() => {
  const app = window.ExpenseApp || {};

  function byId(id) {
    return document.getElementById(id);
  }

  function currentMonthValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function monthLabel(monthValue) {
    if (!monthValue) {
      return "this month";
    }

    const [year, month] = String(monthValue).split("-").map((value) => Number(value));
    if (!year || !month) {
      return monthValue;
    }

    return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  }

  function expenseMonth(expense) {
    return String(expense?.date || "").slice(0, 7);
  }

  function numericBudgetLimit(budget) {
    return Number(budget?.limit_amount ?? budget?.limitAmount ?? 0);
  }

  function createStatus(type, label) {
    return { type, label };
  }

  function buildBudgetRow(budget, spendMap) {
    const category = String(budget?.category || "Other");
    const limit = numericBudgetLimit(budget);
    const spent = spendMap.get(category) || 0;
    const remaining = limit - spent;
    const progress = limit > 0 ? Math.max((spent / limit) * 100, 0) : 0;

    let status = createStatus("neutral", "No spend yet");
    if (spent > limit) {
      status = createStatus("danger", "Over budget");
    } else if (progress >= 85) {
      status = createStatus("warning", "Close to limit");
    } else if (spent > 0) {
      status = createStatus("success", "On track");
    }

    return {
      category,
      limit,
      spent,
      remaining,
      progress,
      status,
    };
  }

  function sortBudgetRows(first, second) {
    const firstRatio = first.limit > 0 ? first.spent / first.limit : 0;
    const secondRatio = second.limit > 0 ? second.spent / second.limit : 0;
    return secondRatio - firstRatio || second.spent - first.spent || first.category.localeCompare(second.category);
  }

  function readBudgetForm(form) {
    return {
      month: String(form?.elements?.namedItem("month")?.value || ""),
      category: String(form?.elements?.namedItem("category")?.value || ""),
      limitAmount: Number(form?.elements?.namedItem("limitAmount")?.value || 0),
    };
  }

  function validateBudgetForm(form, payload) {
    app.clearFormErrors?.(form);
    let hasError = false;

    if (!payload.month) {
      app.setFieldError?.(form, "month", "Please choose a month.");
      hasError = true;
    }

    if (!payload.category) {
      app.setFieldError?.(form, "category", "Please select a category.");
      hasError = true;
    }

    if (!Number.isFinite(payload.limitAmount) || payload.limitAmount <= 0) {
      app.setFieldError?.(form, "limitAmount", "Limit must be greater than 0.");
      hasError = true;
    }

    return !hasError;
  }

  function renderBudgetCard(listNode, row, currency) {
    const card = document.createElement("article");
    card.className = "budget-card";

    const header = document.createElement("div");
    header.className = "budget-card-head";

    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = row.category;
    const subtitle = document.createElement("p");
    subtitle.textContent = `${app.formatCurrency?.(row.spent, currency)} spent of ${app.formatCurrency?.(row.limit, currency)}`;
    copy.append(title, subtitle);

    const status = document.createElement("span");
    status.className = `budget-status ${row.status.type}`;
    status.textContent = row.status.label;

    header.append(copy, status);

    const progressTrack = document.createElement("div");
    progressTrack.className = "budget-progress";

    const progressBar = document.createElement("span");
    progressBar.className = `budget-progress-bar ${row.status.type}`;
    progressBar.style.width = `${Math.min(row.progress, 100)}%`;
    progressTrack.appendChild(progressBar);

    const meta = document.createElement("div");
    meta.className = "budget-meta";

    const spentMeta = document.createElement("div");
    const spentLabel = document.createElement("span");
    spentLabel.textContent = "Spent";
    const spentValue = document.createElement("strong");
    spentValue.textContent = app.formatCurrency?.(row.spent, currency);
    spentMeta.append(spentLabel, spentValue);

    const limitMeta = document.createElement("div");
    const limitLabel = document.createElement("span");
    limitLabel.textContent = "Budget";
    const limitValue = document.createElement("strong");
    limitValue.textContent = app.formatCurrency?.(row.limit, currency);
    limitMeta.append(limitLabel, limitValue);

    const remainingMeta = document.createElement("div");
    const remainingLabel = document.createElement("span");
    remainingLabel.textContent = row.remaining >= 0 ? "Remaining" : "Over by";
    const remainingValue = document.createElement("strong");
    remainingValue.textContent = app.formatCurrency?.(Math.abs(row.remaining), currency);
    remainingMeta.append(remainingLabel, remainingValue);

    meta.append(spentMeta, limitMeta, remainingMeta);
    card.append(header, progressTrack, meta);
    listNode.appendChild(card);
  }

  function renderInsightCard(container, title, body, tags = []) {
    const card = document.createElement("article");
    card.className = "budget-insight-card";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = body;

    card.append(heading, paragraph);

    if (tags.length) {
      const tagList = document.createElement("div");
      tagList.className = "budget-tag-list";

      tags.forEach((tag) => {
        const pill = document.createElement("span");
        pill.className = "budget-tag";
        pill.textContent = tag;
        tagList.appendChild(pill);
      });

      card.appendChild(tagList);
    }

    container.appendChild(card);
  }

  async function initBudgetPage() {
    const form = byId("budgetForm");
    if (!form) {
      return;
    }

    const monthInput = byId("budgetMonth");
    const filterMonthInput = byId("budgetFilterMonth");
    const messageNode = byId("budgetFormMessage");
    const listNode = byId("budgetList");
    const insightsNode = byId("budgetInsights");
    const countChip = byId("budgetCountChip");
    const titleNode = byId("budgetOverviewTitle");
    const subtitleNode = byId("budgetOverviewSubtitle");
    const plannedNode = byId("budgetMetricPlanned");
    const spentNode = byId("budgetMetricSpent");
    const remainingNode = byId("budgetMetricRemaining");
    const overspentNode = byId("budgetMetricOverspent");
    const defaultMonth = currentMonthValue();
    const state = {
      activeMonth: defaultMonth,
      budgets: [],
      expenses: [],
    };

    if (monthInput && !monthInput.value) {
      monthInput.value = defaultMonth;
    }

    if (filterMonthInput && !filterMonthInput.value) {
      filterMonthInput.value = monthInput?.value || defaultMonth;
    }

    state.activeMonth = filterMonthInput?.value || monthInput?.value || defaultMonth;

    function syncMonthInputs(monthValue) {
      if (monthInput) {
        monthInput.value = monthValue;
      }
      if (filterMonthInput) {
        filterMonthInput.value = monthValue;
      }
      state.activeMonth = monthValue;
    }

    function render() {
      const currency = app.getSettings?.().currency || "INR";
      const monthlyExpenses = state.expenses.filter((expense) => expenseMonth(expense) === state.activeMonth);
      const spendMap = monthlyExpenses.reduce((map, expense) => {
        const category = String(expense?.category || "Other");
        const total = map.get(category) || 0;
        map.set(category, total + (Number(expense?.amount) || 0));
        return map;
      }, new Map());

      const budgetRows = state.budgets.map((budget) => buildBudgetRow(budget, spendMap)).sort(sortBudgetRows);
      const totalPlanned = budgetRows.reduce((sum, row) => sum + row.limit, 0);
      const totalSpent = monthlyExpenses.reduce((sum, expense) => sum + (Number(expense?.amount) || 0), 0);
      const remaining = totalPlanned - totalSpent;
      const overspentCount = budgetRows.filter((row) => row.spent > row.limit).length;

      if (titleNode) {
        titleNode.textContent = `${monthLabel(state.activeMonth)} Budget Snapshot`;
      }

      if (subtitleNode) {
        subtitleNode.textContent = budgetRows.length
          ? `${budgetRows.length} budgeted categories and ${monthlyExpenses.length} expense entries tracked this month.`
          : "No budgets saved for this month yet. Add a category budget to start tracking progress.";
      }

      if (plannedNode) {
        plannedNode.textContent = app.formatCurrency?.(totalPlanned, currency);
      }
      if (spentNode) {
        spentNode.textContent = app.formatCurrency?.(totalSpent, currency);
      }
      if (remainingNode) {
        remainingNode.textContent = app.formatCurrency?.(remaining, currency);
        remainingNode.classList.toggle("metric-wrap", false);
      }
      if (overspentNode) {
        overspentNode.textContent = String(overspentCount);
      }
      if (countChip) {
        countChip.textContent = `${budgetRows.length} ${budgetRows.length === 1 ? "category" : "categories"}`;
      }

      if (listNode) {
        listNode.innerHTML = "";
        if (!budgetRows.length) {
          const empty = document.createElement("div");
          empty.className = "empty-state";
          empty.textContent = "No category budgets for this month yet. Save a budget above to start planning.";
          listNode.appendChild(empty);
        } else {
          budgetRows.forEach((row) => renderBudgetCard(listNode, row, currency));
        }
      }

      if (insightsNode) {
        insightsNode.innerHTML = "";

        const plannedCoverage = totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0;
        const topBudgetRow = budgetRows[0] || null;
        const unplannedCategories = Array.from(spendMap.entries())
          .filter(([category]) => !budgetRows.some((row) => row.category === category))
          .sort((first, second) => second[1] - first[1]);

        renderInsightCard(
          insightsNode,
          "Budget health",
          totalPlanned > 0
            ? `${plannedCoverage}% of the planned budget has been used in ${monthLabel(state.activeMonth)}.`
            : `No budget has been planned for ${monthLabel(state.activeMonth)} yet.`
        );

        renderInsightCard(
          insightsNode,
          "Biggest pressure point",
          topBudgetRow
            ? `${topBudgetRow.category} has the highest utilization at ${Math.round(Math.max(topBudgetRow.progress, 0))}% of its limit.`
            : "Once you set budgets, the most pressured category will appear here."
        );

        renderInsightCard(
          insightsNode,
          "Unplanned spending",
          unplannedCategories.length
            ? `${unplannedCategories.length} spending categories have expenses recorded without a budget limit this month.`
            : "Every category with spending this month has a matching budget."
          ,
          unplannedCategories.slice(0, 4).map(([category, amount]) => `${category}: ${app.formatCurrency?.(amount, currency)}`)
        );
      }
    }

    function renderLoadError(message) {
      if (listNode) {
        listNode.innerHTML = `<div class="empty-state">${message}</div>`;
      }
      if (insightsNode) {
        insightsNode.innerHTML = `<div class="empty-state">${message}</div>`;
      }
    }

    async function loadBudgetData(monthValue) {
      const nextMonth = monthValue || currentMonthValue();
      syncMonthInputs(nextMonth);

      if (listNode) {
        listNode.innerHTML = '<div class="empty-state">Loading budgets...</div>';
      }
      if (insightsNode) {
        insightsNode.innerHTML = '<div class="empty-state">Loading insights...</div>';
      }

      try {
        const [budgets, expenses] = await Promise.all([
          app.fetchBudgets?.({ month: nextMonth }) || [],
          app.fetchExpenses?.() || [],
        ]);
        state.budgets = Array.isArray(budgets) ? budgets : [];
        state.expenses = Array.isArray(expenses) ? expenses : [];
        render();
      } catch (error) {
        renderLoadError(error.message || "Unable to load budget data.");
      }
    }

    monthInput?.addEventListener("change", async () => {
      if (!monthInput.value) {
        return;
      }
      await loadBudgetData(monthInput.value);
    });

    filterMonthInput?.addEventListener("change", async () => {
      if (!filterMonthInput.value) {
        return;
      }
      await loadBudgetData(filterMonthInput.value);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = readBudgetForm(form);

      if (!validateBudgetForm(form, payload)) {
        app.showFormMessage?.(messageNode, "Please fix the highlighted fields.", "error");
        return;
      }

      try {
        await app.createBudget?.(payload);
        app.showFormMessage?.(
          messageNode,
          `${payload.category} budget saved for ${monthLabel(payload.month)}.`,
          "success"
        );
        if (form.elements.namedItem("limitAmount")) {
          form.elements.namedItem("limitAmount").value = "";
        }
        if (form.elements.namedItem("category")) {
          form.elements.namedItem("category").value = "";
        }
        await loadBudgetData(payload.month);
      } catch (error) {
        app.showFormMessage?.(messageNode, error.message, "error");
      }
    });

    await loadBudgetData(state.activeMonth);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await initBudgetPage();
  });
})();
