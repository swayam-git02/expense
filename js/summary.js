(() => {
  const app = window.ExpenseApp || {};
  let summaryCharts = [];

  function destroyCharts() {
    summaryCharts.forEach((chart) => chart?.destroy?.());
    summaryCharts = [];
  }

  function updateQueryString(year, month) {
    const url = new URL(window.location.href);
    if (year) {
      url.searchParams.set("year", String(year));
    }
    if (month) {
      url.searchParams.set("month", String(month));
    }
    window.history.replaceState({}, "", url);
  }

  function formatCountLabel(count, singular, plural) {
    const numeric = Number(count || 0);
    return `${numeric} ${numeric === 1 ? singular : plural}`;
  }

  function formatPercent(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
      return "0%";
    }
    return `${numeric >= 10 ? numeric.toFixed(0) : numeric.toFixed(1)}%`;
  }

  function periodDeltaText(delta, previousTotal, currency, periodLabel) {
    const numericDelta = Number(delta || 0);
    const numericPrevious = Number(previousTotal || 0);

    if (!numericPrevious && !numericDelta) {
      return `No change from the previous ${periodLabel}.`;
    }

    if (numericDelta > 0) {
      return `${app.formatCurrency(numericDelta, currency)} higher than the previous ${periodLabel}.`;
    }

    if (numericDelta < 0) {
      return `${app.formatCurrency(Math.abs(numericDelta), currency)} lower than the previous ${periodLabel}.`;
    }

    return `Matching the previous ${periodLabel}.`;
  }

  function createOption(value, label, selectedValue) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    option.selected = String(value) === String(selectedValue);
    return option;
  }

  function setSelectOptions(selectNode, options, selectedValue) {
    if (!selectNode) {
      return;
    }

    selectNode.innerHTML = "";
    options.forEach((option) => {
      selectNode.appendChild(createOption(option.value, option.label, selectedValue));
    });
  }

  function renderMonthlyBreakdown(node, monthlyTrend, currency) {
    if (!node) {
      return;
    }

    node.innerHTML = "";
    const highestTotal = monthlyTrend.reduce(
      (highest, item) => Math.max(highest, Number(item.total || 0)),
      0
    );

    monthlyTrend.forEach((item) => {
      const article = document.createElement("article");
      article.className = "summary-breakdown-item";

      const head = document.createElement("div");
      head.className = "summary-breakdown-head";

      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = item.longLabel || item.label || item.month;
      const meta = document.createElement("p");
      meta.textContent = formatCountLabel(item.count, "transaction", "transactions");
      copy.append(title, meta);

      const amount = document.createElement("strong");
      amount.textContent = app.formatCurrency(item.total || 0, currency);
      head.append(copy, amount);

      const bar = document.createElement("div");
      bar.className = "summary-breakdown-bar";

      const fill = document.createElement("span");
      const fillWidth = highestTotal && Number(item.total || 0)
        ? Math.max((Number(item.total || 0) / highestTotal) * 100, 4)
        : 0;
      fill.style.width = `${fillWidth}%`;
      bar.appendChild(fill);

      article.append(head, bar);
      node.appendChild(article);
    });
  }

  function renderCategoryBreakdown(node, categories, currency) {
    if (!node) {
      return;
    }

    node.innerHTML = "";
    if (!categories.length) {
      node.innerHTML = '<div class="empty-state">No category spending recorded for this month.</div>';
      return;
    }

    categories.forEach((item) => {
      const article = document.createElement("article");
      article.className = "summary-category-item";

      const head = document.createElement("div");
      head.className = "summary-category-head";

      const titleGroup = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = item.category || "Other";
      const meta = document.createElement("p");
      meta.textContent = `${formatPercent(item.share)} of month | ${formatCountLabel(
        item.count,
        "transaction",
        "transactions"
      )}`;
      titleGroup.append(title, meta);

      const amount = document.createElement("strong");
      amount.textContent = app.formatCurrency(item.total || 0, currency);
      head.append(titleGroup, amount);

      const bar = document.createElement("div");
      bar.className = "summary-breakdown-bar";

      const fill = document.createElement("span");
      fill.style.width = `${Math.max(Math.min(Number(item.share || 0), 100), 0)}%`;
      bar.appendChild(fill);

      article.append(head, bar);
      node.appendChild(article);
    });
  }

  function renderRecentTransactions(node, transactions, currency) {
    if (!node) {
      return;
    }

    node.innerHTML = "";
    if (!transactions.length) {
      node.innerHTML = '<li class="empty-state">No transactions recorded for the selected month.</li>';
      return;
    }

    transactions.forEach((item) => {
      const row = document.createElement("li");
      row.className = "transaction-item";

      const copy = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = item.title || "Untitled";
      const meta = document.createElement("p");
      meta.textContent = `${item.category || "Other"} | ${item.date || "No date"} | ${item.payment || "No method"}`;
      copy.append(title, meta);

      const amount = document.createElement("strong");
      amount.textContent = app.formatCurrency(item.amount || 0, currency);
      row.append(copy, amount);
      node.appendChild(row);
    });
  }

  function renderYearComparison(node, yearlyTrend, selectedYear, currency) {
    if (!node) {
      return;
    }

    node.innerHTML = "";
    if (!yearlyTrend.length) {
      node.innerHTML = '<div class="empty-state">No yearly data available yet.</div>';
      return;
    }

    [...yearlyTrend]
      .sort((first, second) => second.year - first.year)
      .forEach((item) => {
        const article = document.createElement("article");
        article.className = "summary-year-card";
        if (Number(item.year) === Number(selectedYear)) {
          article.classList.add("active");
        }

        const label = document.createElement("span");
        label.className = "summary-year-label";
        label.textContent = String(item.year);

        const amount = document.createElement("strong");
        amount.textContent = app.formatCurrency(item.total || 0, currency);

        const meta = document.createElement("p");
        meta.textContent = formatCountLabel(item.count, "transaction", "transactions");

        article.append(label, amount, meta);
        node.appendChild(article);
      });
  }

  function renderHighlights(node, summary, currency) {
    if (!node) {
      return;
    }

    const { filters, overview, monthCategories } = summary;
    const topCategory = monthCategories[0] || null;
    const monthShare = overview.yearTotal ? (Number(overview.monthTotal || 0) / Number(overview.yearTotal || 1)) * 100 : 0;

    const highlights = [
      {
        label: "Highest month",
        value: overview.highestMonth?.label || "No spending yet",
        detail: overview.highestMonth
          ? `${app.formatCurrency(overview.highestMonth.total || 0, currency)} across ${formatCountLabel(
              overview.highestMonth.count,
              "transaction",
              "transactions"
            )}`
          : "Add expenses to reveal your peak month.",
      },
      {
        label: "Largest category this month",
        value: topCategory?.category || "No category spend",
        detail: topCategory
          ? `${app.formatCurrency(topCategory.total || 0, currency)} | ${formatPercent(topCategory.share)} of ${filters.selectedMonthLabel}`
          : `No category totals recorded for ${filters.selectedMonthLabel}.`,
      },
      {
        label: "Selected month share of year",
        value: formatPercent(monthShare),
        detail: overview.yearTotal
          ? `${filters.selectedMonthLabel} contributes ${formatPercent(monthShare)} of ${filters.selectedYearLabel}.`
          : `No yearly spend recorded for ${filters.selectedYearLabel}.`,
      },
      {
        label: "Average active month",
        value: app.formatCurrency(overview.averageActiveMonthSpend || 0, currency),
        detail: overview.activeMonthCount
          ? `${formatCountLabel(overview.activeMonthCount, "month", "months")} with spending in ${filters.selectedYearLabel}.`
          : `No active spending months recorded in ${filters.selectedYearLabel}.`,
      },
    ];

    node.innerHTML = "";
    highlights.forEach((item) => {
      const article = document.createElement("article");
      article.className = "summary-highlight-card";

      const label = document.createElement("span");
      label.className = "summary-highlight-label";
      label.textContent = item.label;

      const value = document.createElement("strong");
      value.textContent = item.value;

      const detail = document.createElement("p");
      detail.textContent = item.detail;

      article.append(label, value, detail);
      node.appendChild(article);
    });
  }

  function renderCharts(summary) {
    if (!window.Chart) {
      return;
    }

    const trendCanvas = document.getElementById("summaryTrendChart");
    const categoryCanvas = document.getElementById("summaryCategoryChart");
    const monthlyTrend = Array.isArray(summary.monthlyTrend) ? summary.monthlyTrend : [];
    const monthCategories = Array.isArray(summary.monthCategories) ? summary.monthCategories : [];

    destroyCharts();

    if (trendCanvas) {
      summaryCharts.push(
        new Chart(trendCanvas, {
          type: "bar",
          data: {
            labels: monthlyTrend.map((item) => item.label),
            datasets: [
              {
                label: "Expenses",
                data: monthlyTrend.map((item) => Number(item.total || 0)),
                backgroundColor: "#2f6bff",
                borderRadius: 10,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
              },
            },
            plugins: {
              legend: {
                display: false,
              },
            },
          },
        })
      );
    }

    if (categoryCanvas) {
      summaryCharts.push(
        new Chart(categoryCanvas, {
          type: "doughnut",
          data: {
            labels: monthCategories.length ? monthCategories.map((item) => item.category) : ["No Data"],
            datasets: [
              {
                data: monthCategories.length ? monthCategories.map((item) => Number(item.total || 0)) : [1],
                backgroundColor: ["#2f6bff", "#11b981", "#38bdf8", "#f59e0b", "#f97316", "#8b5cf6"],
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "64%",
            plugins: {
              legend: {
                display: false,
              },
            },
          },
        })
      );
    }
  }

  function renderSummary(summary) {
    const currency = app.getSettings?.().currency || "INR";
    const { filters, overview, comparisons, monthlyTrend, yearlyTrend, monthCategories, recentTransactions } = summary;

    setSelectOptions(
      document.getElementById("summaryYear"),
      (filters.availableYears || []).map((year) => ({
        value: year,
        label: String(year),
      })),
      filters.selectedYear
    );

    setSelectOptions(
      document.getElementById("summaryMonth"),
      (monthlyTrend || []).map((item) => ({
        value: item.month,
        label: item.longLabel || item.month,
      })),
      filters.selectedMonth
    );

    const rangeDescription = document.getElementById("summaryRangeDescription");
    if (rangeDescription) {
      rangeDescription.textContent = `Review ${filters.selectedMonthLabel} spending inside your ${filters.selectedYearLabel} yearly picture.`;
    }

    const selectionChip = document.getElementById("summarySelectionChip");
    if (selectionChip) {
      selectionChip.textContent = `${filters.selectedMonthLabel} | ${filters.selectedYearLabel}`;
    }

    const monthTotalNode = document.getElementById("summaryMonthTotal");
    if (monthTotalNode) {
      monthTotalNode.textContent = app.formatCurrency(overview.monthTotal || 0, currency);
    }

    const monthMetaNode = document.getElementById("summaryMonthMeta");
    if (monthMetaNode) {
      monthMetaNode.textContent = periodDeltaText(
        comparisons.previousMonth?.delta || 0,
        comparisons.previousMonth?.total || 0,
        currency,
        "month"
      );
    }

    const monthCountNode = document.getElementById("summaryMonthCount");
    if (monthCountNode) {
      monthCountNode.textContent = String(overview.monthTransactionCount || 0);
    }

    const monthCountMetaNode = document.getElementById("summaryMonthCountMeta");
    if (monthCountMetaNode) {
      monthCountMetaNode.textContent = `${formatCountLabel(
        overview.monthTransactionCount,
        "transaction",
        "transactions"
      )} in ${filters.selectedMonthLabel}`;
    }

    const yearTotalNode = document.getElementById("summaryYearTotal");
    if (yearTotalNode) {
      yearTotalNode.textContent = app.formatCurrency(overview.yearTotal || 0, currency);
    }

    const yearMetaNode = document.getElementById("summaryYearMeta");
    if (yearMetaNode) {
      yearMetaNode.textContent = periodDeltaText(
        comparisons.previousYear?.delta || 0,
        comparisons.previousYear?.total || 0,
        currency,
        "year"
      );
    }

    const activeMonthsNode = document.getElementById("summaryActiveMonths");
    if (activeMonthsNode) {
      activeMonthsNode.textContent = String(overview.activeMonthCount || 0);
    }

    const activeMonthsMetaNode = document.getElementById("summaryActiveMonthsMeta");
    if (activeMonthsMetaNode) {
      activeMonthsMetaNode.textContent = overview.activeMonthCount
        ? `Average active month ${app.formatCurrency(overview.averageActiveMonthSpend || 0, currency)}`
        : `No active spending months in ${filters.selectedYearLabel}`;
    }

    const trendChip = document.getElementById("summaryTrendChip");
    if (trendChip) {
      trendChip.textContent = `${filters.selectedYearLabel} monthly totals`;
    }

    const categoryChip = document.getElementById("summaryCategoryChip");
    if (categoryChip) {
      categoryChip.textContent = filters.selectedMonthLabel;
    }

    const breakdownChip = document.getElementById("summaryBreakdownChip");
    if (breakdownChip) {
      breakdownChip.textContent = `${formatCountLabel(
        overview.activeMonthCount,
        "active month",
        "active months"
      )}`;
    }

    const recentChip = document.getElementById("summaryRecentChip");
    if (recentChip) {
      recentChip.textContent = filters.selectedMonthLabel;
    }

    const comparisonChip = document.getElementById("summaryYearComparisonChip");
    if (comparisonChip) {
      comparisonChip.textContent = `${formatCountLabel(yearlyTrend.length, "year", "years")} recorded`;
    }

    renderMonthlyBreakdown(document.getElementById("summaryMonthBreakdown"), monthlyTrend || [], currency);
    renderCategoryBreakdown(document.getElementById("summaryCategoryList"), monthCategories || [], currency);
    renderRecentTransactions(
      document.getElementById("summaryRecentTransactions"),
      recentTransactions || [],
      currency
    );
    renderYearComparison(document.getElementById("summaryYearComparison"), yearlyTrend || [], filters.selectedYear, currency);
    renderHighlights(document.getElementById("summaryHighlights"), summary, currency);
    renderCharts(summary);
    updateQueryString(filters.selectedYear, filters.selectedMonth);
  }

  async function initSummaryPage() {
    const yearSelect = document.getElementById("summaryYear");
    if (!yearSelect) {
      return;
    }

    const monthSelect = document.getElementById("summaryMonth");
    const refreshButton = document.getElementById("summaryRefreshBtn");
    const messageNode = document.getElementById("summaryPageMessage");
    const params = new URLSearchParams(window.location.search);

    async function loadSummary(requestParams = {}) {
      if (!app.fetchExpenseSummary) {
        return;
      }

      yearSelect.disabled = true;
      monthSelect.disabled = true;
      if (refreshButton) {
        refreshButton.disabled = true;
      }
      app.showFormMessage?.(messageNode, "", "");

      try {
        const summary = await app.fetchExpenseSummary(requestParams);
        renderSummary(summary);
      } catch (error) {
        app.showFormMessage?.(messageNode, error.message, "error");
      } finally {
        yearSelect.disabled = false;
        monthSelect.disabled = false;
        if (refreshButton) {
          refreshButton.disabled = false;
        }
      }
    }

    yearSelect.addEventListener("change", async () => {
      await loadSummary({ year: yearSelect.value });
    });

    monthSelect.addEventListener("change", async () => {
      await loadSummary({
        year: yearSelect.value,
        month: monthSelect.value,
      });
    });

    refreshButton?.addEventListener("click", async () => {
      await loadSummary({
        year: yearSelect.value,
        month: monthSelect.value,
      });
    });

    await loadSummary({
      year: params.get("year") || undefined,
      month: params.get("month") || undefined,
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await initSummaryPage();
  });
})();
