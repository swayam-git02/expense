(() => {
  const app = window.ExpenseApp || {};
  const KEYS = {
    participants: "expenseTracker.splitParticipants",
    records: "expenseTracker.splitRecords",
  };

  const state = {
    current: null,
    categoryChart: null,
    contributionChart: null,
  };

  const els = {};

  const safeParse = (value, fallback) => {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  };

  const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const byId = (id) => document.getElementById(id);
  const money = (value) => (app.formatCurrency ? app.formatCurrency(value) : `$${round2(value).toFixed(2)}`);
  const sanitize = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const getParticipants = () => {
    const raw = safeParse(localStorage.getItem(KEYS.participants), []);
    return Array.isArray(raw) ? raw : [];
  };

  const saveParticipantsStorage = (items) => {
    localStorage.setItem(KEYS.participants, JSON.stringify(items));
  };

  const getRecords = () => {
    const raw = safeParse(localStorage.getItem(KEYS.records), []);
    return Array.isArray(raw) ? raw : [];
  };

  const saveRecords = (items) => {
    localStorage.setItem(KEYS.records, JSON.stringify(items));
  };

  const participantById = (id) => getParticipants().find((p) => p.id === id) || null;

  const showMessage = (node, text, type) => app.showFormMessage?.(node, text, type);
  const todayIso = () => new Date().toISOString().slice(0, 10);

  function selectedParticipantIds() {
    return Array.from(
      els.participantsSelector?.querySelectorAll('input[type="checkbox"]:checked') || []
    ).map((input) => input.value);
  }

  function splitMethod() {
    return document.querySelector('input[name="splitMethod"]:checked')?.value || "equal";
  }

  function renderPaidBy() {
    const participants = getParticipants();
    const selected = els.paidBy.value;
    els.paidBy.innerHTML = '<option value="">Select payer</option>';
    participants.forEach((participant) => {
      const option = document.createElement("option");
      option.value = participant.id;
      option.textContent = participant.name;
      els.paidBy.appendChild(option);
    });
    if (participants.some((p) => p.id === selected)) {
      els.paidBy.value = selected;
    }
  }

  function renderParticipantSelector() {
    const participants = getParticipants();
    const selected = new Set(selectedParticipantIds());
    els.participantsSelector.innerHTML = "";
    if (!participants.length) {
      els.participantsSelector.innerHTML = '<div class="empty-state">Add participants to continue.</div>';
      return;
    }
    participants.forEach((participant) => {
      const label = document.createElement("label");
      label.className = "selector-chip";
      label.innerHTML = `
        <input type="checkbox" value="${participant.id}" ${selected.size ? (selected.has(participant.id) ? "checked" : "") : "checked"}>
        <span>${sanitize(participant.name)}</span>
      `;
      els.participantsSelector.appendChild(label);
    });
  }

  function renderParticipantCards() {
    const participants = getParticipants();
    els.participantCount.textContent = `${participants.length} member${participants.length === 1 ? "" : "s"}`;
    els.participantList.innerHTML = "";

    if (!participants.length) {
      els.participantList.innerHTML = '<div class="empty-state">No participants added yet.</div>';
    } else {
      participants.forEach((participant) => {
        const card = document.createElement("article");
        card.className = "participant-card";
        card.innerHTML = `
          <div>
            <h4>${sanitize(participant.name)}</h4>
            <p>${participant.email ? sanitize(participant.email) : "No email provided"}</p>
          </div>
          <button type="button" class="remove-participant-btn" data-remove-participant="${participant.id}">Remove</button>
        `;
        els.participantList.appendChild(card);
      });
    }

    renderPaidBy();
    renderParticipantSelector();
    renderDistributionInputs();
    renderFilterParticipants();
  }

  function renderFilterParticipants() {
    const previous = els.historyParticipantFilter.value || "all";
    const names = new Set();
    getRecords().forEach((record) => {
      (record.participantNames || []).forEach((name) => names.add(name));
    });
    els.historyParticipantFilter.innerHTML = '<option value="all">All participants</option>';
    Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        els.historyParticipantFilter.appendChild(option);
      });
    if (previous === "all" || names.has(previous)) {
      els.historyParticipantFilter.value = previous;
    }
  }

  function renderDistributionInputs() {
    const method = splitMethod();
    const ids = selectedParticipantIds();
    els.distribution.innerHTML = "";

    if (!ids.length) {
      els.distribution.innerHTML = '<p class="distribution-help">Select participants to configure split values.</p>';
      return;
    }

    if (method === "equal") {
      els.distribution.innerHTML = '<p class="distribution-help">Equal split divides amount equally among selected participants.</p>';
      return;
    }

    const title = document.createElement("h4");
    title.textContent = method === "custom" ? "Custom Amount Split" : "Percentage Split";
    const help = document.createElement("p");
    help.className = "distribution-help";
    help.textContent =
      method === "custom"
        ? "Enter amount per participant. Sum must match total amount."
        : "Enter percentage per participant. Sum must equal 100%.";
    const grid = document.createElement("div");
    grid.className = "distribution-grid";

    ids.forEach((id) => {
      const participant = participantById(id);
      if (!participant) return;
      const row = document.createElement("div");
      row.className = "distribution-row";
      row.innerHTML = `
        <label>${sanitize(participant.name)}</label>
        <input type="number" min="0" step="0.01" data-split-value-for="${id}" placeholder="${method === "custom" ? "Amount" : "Percent"}">
      `;
      grid.appendChild(row);
    });

    els.distribution.append(title, help, grid);
  }

  function readSplitForm() {
    app.clearFormErrors?.(els.splitForm);
    const title = String(byId("splitTitle")?.value || "").trim();
    const amount = Number(byId("splitAmount")?.value || 0);
    const category = String(byId("splitCategory")?.value || "");
    const date = String(byId("splitDate")?.value || "");
    const paidBy = String(byId("splitPaidBy")?.value || "");
    const method = splitMethod();
    const participantIds = selectedParticipantIds();

    let invalid = false;
    if (title.length < 2) {
      app.setFieldError?.(els.splitForm, "splitTitle", "Enter a valid title.");
      invalid = true;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      app.setFieldError?.(els.splitForm, "splitAmount", "Amount must be greater than 0.");
      invalid = true;
    }
    if (!category) {
      app.setFieldError?.(els.splitForm, "splitCategory", "Select a category.");
      invalid = true;
    }
    if (!date) {
      app.setFieldError?.(els.splitForm, "splitDate", "Select a date.");
      invalid = true;
    }
    if (!paidBy) {
      app.setFieldError?.(els.splitForm, "splitPaidBy", "Select who paid.");
      invalid = true;
    }
    if (participantIds.length < 2) {
      app.setFieldError?.(els.splitForm, "splitParticipants", "Select at least two participants.");
      invalid = true;
    }
    if (paidBy && !participantIds.includes(paidBy)) {
      app.setFieldError?.(els.splitForm, "splitParticipants", "Payer must be part of selected participants.");
      invalid = true;
    }
    if (invalid) {
      throw new Error("Please fix form errors before calculation.");
    }

    return { title, amount: round2(amount), category, date, paidBy, method, participantIds };
  }

  function calculateEqualSplit(total, participantIds) {
    const shares = {};
    if (!participantIds.length) return shares;
    const base = round2(total / participantIds.length);
    participantIds.forEach((id) => {
      shares[id] = base;
    });
    const diff = round2(total - Object.values(shares).reduce((sum, amount) => sum + amount, 0));
    shares[participantIds[participantIds.length - 1]] = round2(shares[participantIds[participantIds.length - 1]] + diff);
    return shares;
  }

  function calculateCustomSplit(total, participantIds) {
    const shares = {};
    let sum = 0;
    participantIds.forEach((id) => {
      const node = els.distribution.querySelector(`[data-split-value-for="${id}"]`);
      const amount = round2(Number(node?.value || 0));
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Custom split values must be valid positive numbers.");
      }
      shares[id] = amount;
      sum = round2(sum + amount);
    });
    if (Math.abs(sum - total) > 0.01) {
      throw new Error("Custom split total must equal the expense amount.");
    }
    return shares;
  }

  function calculatePercentageSplit(total, participantIds) {
    const percentages = {};
    let percentSum = 0;
    participantIds.forEach((id) => {
      const node = els.distribution.querySelector(`[data-split-value-for="${id}"]`);
      const percent = round2(Number(node?.value || 0));
      if (!Number.isFinite(percent) || percent < 0) {
        throw new Error("Percentage values must be valid positive numbers.");
      }
      percentages[id] = percent;
      percentSum = round2(percentSum + percent);
    });
    if (Math.abs(percentSum - 100) > 0.01) {
      throw new Error("Percentage split must total 100%.");
    }
    const shares = {};
    participantIds.forEach((id) => {
      shares[id] = round2((total * percentages[id]) / 100);
    });
    const diff = round2(total - Object.values(shares).reduce((sum, amount) => sum + amount, 0));
    shares[participantIds[participantIds.length - 1]] = round2(shares[participantIds[participantIds.length - 1]] + diff);
    return shares;
  }

  function displaySplitResult(result) {
    els.resultSection.classList.remove("hidden-state");
    els.resultBody.innerHTML = "";
    els.payerSummary.textContent = `${result.paidByName} paid ${money(result.totalAmount)}.`;

    result.breakdown.forEach((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${sanitize(item.name)}</td>
        <td>${money(item.amountOwed)}</td>
        <td><span class="${item.isPayer ? "payer-badge" : "owed-badge"}">${item.isPayer ? "Paid" : "Owes"}</span></td>
      `;
      els.resultBody.appendChild(row);
    });

    els.settlementCards.innerHTML = "";
    if (!result.settlements.length) {
      els.settlementCards.innerHTML = '<div class="empty-state">No settlements required.</div>';
    } else {
      result.settlements.forEach((settlement) => {
        const card = document.createElement("article");
        card.className = "settlement-card";
        card.innerHTML = `<p>${sanitize(settlement.fromName)} -> ${sanitize(settlement.toName)}</p><strong>${money(settlement.amount)}</strong>`;
        els.settlementCards.appendChild(card);
      });
    }
  }

  function calculateSplit() {
    const payload = readSplitForm();
    const payer = participantById(payload.paidBy);
    let shares;
    if (payload.method === "equal") shares = calculateEqualSplit(payload.amount, payload.participantIds);
    if (payload.method === "custom") shares = calculateCustomSplit(payload.amount, payload.participantIds);
    if (payload.method === "percentage") shares = calculatePercentageSplit(payload.amount, payload.participantIds);

    const breakdown = payload.participantIds.map((id) => {
      const participant = participantById(id);
      return {
        participantId: id,
        name: participant?.name || "Unknown",
        amountOwed: round2(shares[id] || 0),
        isPayer: id === payload.paidBy,
      };
    });

    const settlements = breakdown
      .filter((item) => !item.isPayer && item.amountOwed > 0)
      .map((item) => ({
        fromId: item.participantId,
        fromName: item.name,
        toId: payload.paidBy,
        toName: payer?.name || "Unknown",
        amount: item.amountOwed,
      }));

    state.current = {
      id: app.generateId ? app.generateId() : `${Date.now()}`,
      date: payload.date,
      title: payload.title,
      totalAmount: payload.amount,
      category: payload.category,
      paidById: payload.paidBy,
      paidByName: payer?.name || "Unknown",
      splitType: payload.method,
      participantIds: payload.participantIds,
      participantNames: breakdown.map((item) => item.name),
      breakdown,
      settlements,
      createdAt: new Date().toISOString(),
    };
    displaySplitResult(state.current);
    return state.current;
  }

  function saveSplit() {
    try {
      const record = state.current || calculateSplit();
      const records = getRecords();
      records.push(record);
      saveRecords(records);
      renderHistory();
      renderCharts();
      renderFilterParticipants();
      updateNotifyCount();
      showMessage(els.splitMessage, "Split saved successfully.", "success");
    } catch (error) {
      showMessage(els.splitMessage, error.message, "error");
    }
  }

  function deleteSplit(id) {
    const records = getRecords();
    const target = records.find((record) => record.id === id);
    if (!target) return;
    if (!window.confirm(`Delete split "${target.title}"?`)) return;
    saveRecords(records.filter((record) => record.id !== id));
    renderHistory();
    renderCharts();
    renderFilterParticipants();
    updateNotifyCount();
  }

  function exportSplitCSV(id) {
    const records = getRecords();
    const selected = id ? records.filter((record) => record.id === id) : records;
    if (!selected.length) return;

    const rows = [
      ["Date", "Expense Title", "Amount", "Paid By", "Participants", "Split Method"],
      ...selected.map((record) => [
        record.date,
        record.title,
        record.totalAmount,
        record.paidByName,
        (record.participantNames || []).join(" | "),
        record.splitType,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = id ? `split-${id}.csv` : `split-report-${todayIso()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderHistory() {
    const search = String(els.historySearch.value || "").trim().toLowerCase();
    const filterParticipant = els.historyParticipantFilter.value || "all";
    const sort = els.historySort.value || "newest";

    const records = getRecords()
      .filter((record) => {
        const searchable = `${record.title} ${record.paidByName} ${(record.participantNames || []).join(" ")}`.toLowerCase();
        const participantMatch =
          filterParticipant === "all" || (record.participantNames || []).includes(filterParticipant);
        return (!search || searchable.includes(search)) && participantMatch;
      })
      .sort((a, b) => {
        const first = new Date(a.date || 0).getTime();
        const second = new Date(b.date || 0).getTime();
        return sort === "oldest" ? first - second : second - first;
      });

    els.historyBody.innerHTML = "";
    if (!records.length) {
      els.historyBody.innerHTML = `
        <tr><td colspan="7"><div class="empty-state">No split records found.</div></td></tr>
      `;
      return;
    }

    records.forEach((record) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${sanitize(record.date)}</td>
        <td>${sanitize(record.title)}</td>
        <td>${money(record.totalAmount)}</td>
        <td>${sanitize((record.participantNames || []).join(", "))}</td>
        <td>${sanitize(record.paidByName)}</td>
        <td>${sanitize(record.splitType)}</td>
        <td>
          <div class="split-history-actions">
            <button class="action-btn edit" type="button" data-view-split="${record.id}">View</button>
            <button class="action-btn delete" type="button" data-delete-split="${record.id}">Delete</button>
            <button class="action-btn" type="button" data-export-split="${record.id}">Export</button>
          </div>
        </td>
      `;
      els.historyBody.appendChild(row);
    });
  }

  function openViewModal(id) {
    const record = getRecords().find((item) => item.id === id);
    if (!record) return;

    els.viewContent.innerHTML = `
      <div class="split-view-content">
        <div class="split-view-row"><p>Date</p><strong>${sanitize(record.date)}</strong></div>
        <div class="split-view-row"><p>Expense</p><strong>${sanitize(record.title)}</strong></div>
        <div class="split-view-row"><p>Total</p><strong>${money(record.totalAmount)}</strong></div>
        <div class="split-view-row"><p>Paid By</p><strong>${sanitize(record.paidByName)}</strong></div>
        <div class="split-view-row"><p>Participants</p><strong>${sanitize((record.participantNames || []).join(", "))}</strong></div>
        <div class="split-view-row"><p>Settlement</p><strong>${sanitize((record.settlements || []).map((s) => `${s.fromName} -> ${s.toName} (${money(s.amount)})`).join("; ") || "No settlement required")}</strong></div>
      </div>
    `;
    els.viewModal.classList.add("show");
    els.viewModal.setAttribute("aria-hidden", "false");
  }

  function closeViewModal() {
    els.viewModal.classList.remove("show");
    els.viewModal.setAttribute("aria-hidden", "true");
  }

  function renderCharts() {
    if (!window.Chart) return;
    const records = getRecords();
    const categoryTotals = {};
    const contributionTotals = {};
    records.forEach((record) => {
      const category = record.category || "Other";
      categoryTotals[category] = round2((categoryTotals[category] || 0) + Number(record.totalAmount || 0));
      const payer = record.paidByName || "Unknown";
      contributionTotals[payer] = round2((contributionTotals[payer] || 0) + Number(record.totalAmount || 0));
    });

    state.categoryChart?.destroy?.();
    state.contributionChart?.destroy?.();

    state.categoryChart = new Chart(els.categoryChart, {
      type: "pie",
      data: {
        labels: Object.keys(categoryTotals).length ? Object.keys(categoryTotals) : ["No Data"],
        datasets: [
          {
            data: Object.values(categoryTotals).length ? Object.values(categoryTotals) : [1],
            backgroundColor: ["#2f6bff", "#11b981", "#34d399", "#60a5fa", "#22c55e", "#93c5fd"],
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } },
    });

    state.contributionChart = new Chart(els.contributionChart, {
      type: "bar",
      data: {
        labels: Object.keys(contributionTotals).length ? Object.keys(contributionTotals) : ["No Data"],
        datasets: [
          {
            label: "Contribution",
            data: Object.values(contributionTotals).length ? Object.values(contributionTotals) : [0],
            backgroundColor: "#2f6bff",
            borderRadius: 8,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    });
  }

  function updateNotifyCount() {
    els.notifyCount.textContent = String(getRecords().length);
  }

  function addParticipant(event) {
    event?.preventDefault?.();
    app.clearFormErrors?.(els.participantForm);

    const name = String(els.participantName.value || "").trim();
    const email = String(els.participantEmail.value || "").trim();
    const participants = getParticipants();
    let invalid = false;

    if (name.length < 2) {
      app.setFieldError?.(els.participantForm, "participantName", "Name must be at least 2 characters.");
      invalid = true;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      app.setFieldError?.(els.participantForm, "participantEmail", "Enter a valid email.");
      invalid = true;
    }
    if (participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      app.setFieldError?.(els.participantForm, "participantName", "Participant already exists.");
      invalid = true;
    }
    if (invalid) {
      showMessage(els.participantMessage, "Could not add participant.", "error");
      return;
    }

    participants.push({
      id: app.generateId ? app.generateId() : `${Date.now()}-${Math.random()}`,
      name,
      email,
    });
    saveParticipantsStorage(participants);
    els.participantForm.reset();
    showMessage(els.participantMessage, "Participant added.", "success");
    renderParticipantCards();
  }

  function removeParticipant(id) {
    saveParticipantsStorage(getParticipants().filter((participant) => participant.id !== id));
    renderParticipantCards();
  }

  function clearAllParticipants() {
    if (!getParticipants().length) return;
    if (!window.confirm("Remove all participants?")) return;
    saveParticipantsStorage([]);
    renderParticipantCards();
    showMessage(els.participantMessage, "All participants removed.", "success");
  }

  function bindEvents() {
    els.participantForm.addEventListener("submit", addParticipant);
    els.participantList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-participant]");
      if (!button) return;
      removeParticipant(button.getAttribute("data-remove-participant"));
    });
    els.clearParticipantsBtn.addEventListener("click", clearAllParticipants);
    els.participantsSelector.addEventListener("change", renderDistributionInputs);
    document.querySelectorAll('input[name="splitMethod"]').forEach((input) => input.addEventListener("change", renderDistributionInputs));

    els.calculateSplitBtn.addEventListener("click", () => {
      try {
        calculateSplit();
        showMessage(els.splitMessage, "Split calculated successfully.", "success");
      } catch (error) {
        showMessage(els.splitMessage, error.message, "error");
      }
    });
    els.saveSplitBtn.addEventListener("click", saveSplit);

    els.splitForm.addEventListener("reset", () => {
      setTimeout(() => {
        els.splitDate.value = todayIso();
        app.clearFormErrors?.(els.splitForm);
        showMessage(els.splitMessage, "", "");
        state.current = null;
        els.resultSection.classList.add("hidden-state");
        renderParticipantSelector();
        renderDistributionInputs();
      }, 0);
    });

    els.historySearch.addEventListener("input", renderHistory);
    els.historyParticipantFilter.addEventListener("change", renderHistory);
    els.historySort.addEventListener("change", renderHistory);
    els.historyBody.addEventListener("click", (event) => {
      const view = event.target.closest("[data-view-split]");
      const del = event.target.closest("[data-delete-split]");
      const exp = event.target.closest("[data-export-split]");
      if (view) openViewModal(view.getAttribute("data-view-split"));
      if (del) deleteSplit(del.getAttribute("data-delete-split"));
      if (exp) exportSplitCSV(exp.getAttribute("data-export-split"));
    });

    els.exportAllBtn.addEventListener("click", () => exportSplitCSV());
    els.closeViewModalBtn.addEventListener("click", closeViewModal);
    els.viewModal.addEventListener("click", (event) => {
      if (event.target === els.viewModal) closeViewModal();
    });
    els.darkModeToggle.addEventListener("change", () => app.setTheme?.(els.darkModeToggle.checked));
  }

  function boot() {
    if (document.body.dataset.page !== "split") return;

    els.participantForm = byId("participantForm");
    els.participantName = byId("participantName");
    els.participantEmail = byId("participantEmail");
    els.participantMessage = byId("participantMessage");
    els.clearParticipantsBtn = byId("clearParticipantsBtn");
    els.participantList = byId("participantsList");
    els.participantCount = byId("participantCountChip");

    els.splitForm = byId("splitForm");
    els.splitDate = byId("splitDate");
    els.paidBy = byId("splitPaidBy");
    els.participantsSelector = byId("splitParticipantsSelector");
    els.distribution = byId("splitDistributionInputs");
    els.calculateSplitBtn = byId("calculateSplitBtn");
    els.saveSplitBtn = byId("saveSplitBtn");
    els.splitMessage = byId("splitFormMessage");
    els.resultSection = byId("splitResultSection");
    els.resultBody = byId("splitResultBody");
    els.payerSummary = byId("splitPayerSummary");
    els.settlementCards = byId("settlementCards");

    els.historySearch = byId("splitSearch");
    els.historyParticipantFilter = byId("splitParticipantFilter");
    els.historySort = byId("splitSort");
    els.historyBody = byId("splitHistoryBody");
    els.exportAllBtn = byId("exportAllSplitsBtn");

    els.categoryChart = byId("splitCategoryChart");
    els.contributionChart = byId("splitContributionChart");
    els.notifyCount = byId("splitNotifyCount");
    els.darkModeToggle = byId("splitDarkModeToggle");

    els.viewModal = byId("splitViewModal");
    els.viewContent = byId("splitViewContent");
    els.closeViewModalBtn = byId("closeSplitViewModalBtn");

    els.splitDate.value = todayIso();
    els.darkModeToggle.checked = Boolean(app.getSettings?.().darkMode);

    bindEvents();
    renderParticipantCards();
    renderHistory();
    renderCharts();
    updateNotifyCount();
  }

  window.addParticipant = addParticipant;
  window.removeParticipant = removeParticipant;
  window.calculateEqualSplit = calculateEqualSplit;
  window.calculateCustomSplit = calculateCustomSplit;
  window.calculatePercentageSplit = calculatePercentageSplit;
  window.displaySplitResult = displaySplitResult;
  window.saveSplit = saveSplit;
  window.deleteSplit = deleteSplit;
  window.exportSplitCSV = exportSplitCSV;

  document.addEventListener("DOMContentLoaded", boot);
})();
