(() => {
  const app = window.ExpenseApp || {};
  const state = {
    participants: [],
    records: [],
    current: null,
    categoryChart: null,
    contributionChart: null,
  };

  const els = {};

  const byId = (id) => document.getElementById(id);
  const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const money = (value) => app.formatCurrency?.(value) || `INR ${round2(value).toFixed(2)}`;

  function sanitize(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function participantById(id) {
    return state.participants.find((participant) => String(participant.id) === String(id)) || null;
  }

  function selectedParticipantIds() {
    return Array.from(
      els.participantsSelector?.querySelectorAll('input[type="checkbox"]:checked') || []
    ).map((input) => input.value);
  }

  function splitMethod() {
    return document.querySelector('input[name="splitMethod"]:checked')?.value || "equal";
  }

  function normalizeSplitRecord(record) {
    const participantsPayload = record.participants || {};
    const participantNames = Array.isArray(participantsPayload)
      ? participantsPayload
          .map((item) => (typeof item === "string" ? item : item?.name))
          .filter(Boolean)
      : Array.isArray(participantsPayload.participantNames)
        ? participantsPayload.participantNames
        : [];

    const breakdown = Array.isArray(participantsPayload.breakdown)
      ? participantsPayload.breakdown
      : [];
    const settlements = Array.isArray(participantsPayload.settlements)
      ? participantsPayload.settlements
      : [];

    return {
      id: String(record.id),
      title: record.title || "",
      totalAmount: Number(record.amount || 0),
      paidByName: record.paid_by || record.paidBy || "",
      splitType: record.split_type || record.splitType || "equal",
      date: record.date || "",
      participantNames,
      breakdown,
      settlements,
      category: participantsPayload.category || record.category || "Other",
    };
  }

  async function loadParticipants() {
    const participants = await app.fetchSplitParticipants?.();
    state.participants = Array.isArray(participants) ? participants : [];
  }

  async function loadRecords() {
    const records = await app.fetchSplitRecords?.();
    state.records = Array.isArray(records) ? records.map(normalizeSplitRecord) : [];
  }

  function renderPaidBy() {
    const selected = els.paidBy.value;
    els.paidBy.innerHTML = '<option value="">Select payer</option>';
    state.participants.forEach((participant) => {
      const option = document.createElement("option");
      option.value = String(participant.id);
      option.textContent = participant.name;
      els.paidBy.appendChild(option);
    });

    if (state.participants.some((item) => String(item.id) === selected)) {
      els.paidBy.value = selected;
    }
  }

  function renderParticipantSelector() {
    const selected = new Set(selectedParticipantIds());
    els.participantsSelector.innerHTML = "";

    if (!state.participants.length) {
      els.participantsSelector.innerHTML = '<div class="empty-state">Add participants to continue.</div>';
      return;
    }

    state.participants.forEach((participant) => {
      const label = document.createElement("label");
      label.className = "selector-chip";
      label.innerHTML = `
        <input type="checkbox" value="${participant.id}" ${selected.size ? (selected.has(String(participant.id)) ? "checked" : "") : "checked"}>
        <span>${sanitize(participant.name)}</span>
      `;
      els.participantsSelector.appendChild(label);
    });
  }

  function renderParticipantCards() {
    els.participantCount.textContent = `${state.participants.length} member${state.participants.length === 1 ? "" : "s"}`;
    els.participantList.innerHTML = "";

    if (!state.participants.length) {
      els.participantList.innerHTML = '<div class="empty-state">No participants added yet.</div>';
    } else {
      state.participants.forEach((participant) => {
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
    state.records.forEach((record) => {
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
      if (!participant) {
        return;
      }

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
    const paidById = String(byId("splitPaidBy")?.value || "");
    const method = splitMethod();
    const participantIds = selectedParticipantIds();

    let hasError = false;
    if (title.length < 2) {
      app.setFieldError?.(els.splitForm, "splitTitle", "Enter a valid title.");
      hasError = true;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      app.setFieldError?.(els.splitForm, "splitAmount", "Amount must be greater than 0.");
      hasError = true;
    }
    if (!category) {
      app.setFieldError?.(els.splitForm, "splitCategory", "Select a category.");
      hasError = true;
    }
    if (!date) {
      app.setFieldError?.(els.splitForm, "splitDate", "Select a date.");
      hasError = true;
    }
    if (!paidById) {
      app.setFieldError?.(els.splitForm, "splitPaidBy", "Select who paid.");
      hasError = true;
    }
    if (participantIds.length < 2) {
      app.setFieldError?.(els.splitForm, "splitParticipants", "Select at least two participants.");
      hasError = true;
    }
    if (paidById && !participantIds.includes(paidById)) {
      app.setFieldError?.(els.splitForm, "splitParticipants", "Payer must be selected in participants.");
      hasError = true;
    }

    if (hasError) {
      throw new Error("Please fix form errors before calculation.");
    }

    return {
      title,
      amount: round2(amount),
      category,
      date,
      paidById,
      method,
      participantIds,
    };
  }

  function calculateEqualSplit(total, participantIds) {
    const shares = {};
    if (!participantIds.length) {
      return shares;
    }

    const share = round2(total / participantIds.length);
    participantIds.forEach((id) => {
      shares[id] = share;
    });

    const totalAssigned = round2(
      Object.values(shares).reduce((sum, value) => sum + value, 0)
    );
    const diff = round2(total - totalAssigned);
    const lastId = participantIds[participantIds.length - 1];
    shares[lastId] = round2(shares[lastId] + diff);

    return shares;
  }

  function calculateCustomSplit(total, participantIds) {
    const shares = {};
    let assigned = 0;

    participantIds.forEach((id) => {
      const input = els.distribution.querySelector(`[data-split-value-for="${id}"]`);
      const value = round2(Number(input?.value || 0));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("Custom split values must be valid positive numbers.");
      }
      shares[id] = value;
      assigned = round2(assigned + value);
    });

    if (Math.abs(assigned - total) > 0.01) {
      throw new Error("Custom split total must equal the expense amount.");
    }

    return shares;
  }

  function calculatePercentageSplit(total, participantIds) {
    const percentages = {};
    let totalPercent = 0;
    participantIds.forEach((id) => {
      const input = els.distribution.querySelector(`[data-split-value-for="${id}"]`);
      const value = round2(Number(input?.value || 0));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("Percentage values must be valid positive numbers.");
      }
      percentages[id] = value;
      totalPercent = round2(totalPercent + value);
    });

    if (Math.abs(totalPercent - 100) > 0.01) {
      throw new Error("Percentage split must total 100%.");
    }

    const shares = {};
    participantIds.forEach((id) => {
      shares[id] = round2((total * percentages[id]) / 100);
    });

    const assigned = round2(
      Object.values(shares).reduce((sum, value) => sum + value, 0)
    );
    const diff = round2(total - assigned);
    const lastId = participantIds[participantIds.length - 1];
    shares[lastId] = round2(shares[lastId] + diff);

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
    const payer = participantById(payload.paidById);

    let shares = {};
    if (payload.method === "equal") shares = calculateEqualSplit(payload.amount, payload.participantIds);
    if (payload.method === "custom") shares = calculateCustomSplit(payload.amount, payload.participantIds);
    if (payload.method === "percentage") shares = calculatePercentageSplit(payload.amount, payload.participantIds);

    const breakdown = payload.participantIds.map((id) => {
      const participant = participantById(id);
      return {
        participantId: id,
        name: participant?.name || "Unknown",
        amountOwed: round2(shares[id] || 0),
        isPayer: id === payload.paidById,
      };
    });

    const settlements = breakdown
      .filter((item) => !item.isPayer && item.amountOwed > 0)
      .map((item) => ({
        fromId: item.participantId,
        fromName: item.name,
        toId: payload.paidById,
        toName: payer?.name || "Unknown",
        amount: item.amountOwed,
      }));

    state.current = {
      id: app.generateId?.() || `${Date.now()}`,
      title: payload.title,
      totalAmount: payload.amount,
      paidByName: payer?.name || "Unknown",
      paidById: payload.paidById,
      splitType: payload.method,
      date: payload.date,
      category: payload.category,
      participantIds: payload.participantIds,
      participantNames: breakdown.map((item) => item.name),
      breakdown,
      settlements,
    };

    displaySplitResult(state.current);
    return state.current;
  }

  function filteredRecords() {
    const search = String(els.historySearch.value || "").trim().toLowerCase();
    const participant = els.historyParticipantFilter.value || "all";
    const sort = els.historySort.value || "newest";

    const records = state.records.filter((record) => {
      const searchable = `${record.title} ${record.paidByName} ${(record.participantNames || []).join(" ")}`.toLowerCase();
      const participantMatch =
        participant === "all" || (record.participantNames || []).includes(participant);
      return (!search || searchable.includes(search)) && participantMatch;
    });

    records.sort((a, b) => {
      const first = new Date(a.date || 0).getTime();
      const second = new Date(b.date || 0).getTime();
      return sort === "oldest" ? first - second : second - first;
    });

    return records;
  }

  function renderHistory() {
    const records = filteredRecords();
    els.historyBody.innerHTML = "";

    if (!records.length) {
      els.historyBody.innerHTML = '<tr><td colspan="7"><div class="empty-state">No split records found.</div></td></tr>';
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
    const record = state.records.find((item) => String(item.id) === String(id));
    if (!record) {
      return;
    }

    const settlementText = (record.settlements || []).length
      ? record.settlements
          .map((item) => `${item.fromName} -> ${item.toName} (${money(item.amount)})`)
          .join("; ")
      : "No settlement required";

    els.viewContent.innerHTML = `
      <div class="split-view-content">
        <div class="split-view-row"><p>Date</p><strong>${sanitize(record.date)}</strong></div>
        <div class="split-view-row"><p>Expense</p><strong>${sanitize(record.title)}</strong></div>
        <div class="split-view-row"><p>Total</p><strong>${money(record.totalAmount)}</strong></div>
        <div class="split-view-row"><p>Paid By</p><strong>${sanitize(record.paidByName)}</strong></div>
        <div class="split-view-row"><p>Participants</p><strong>${sanitize((record.participantNames || []).join(", "))}</strong></div>
        <div class="split-view-row"><p>Settlement</p><strong>${sanitize(settlementText)}</strong></div>
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
    if (!window.Chart) {
      return;
    }

    const categoryTotals = {};
    const contributionTotals = {};

    state.records.forEach((record) => {
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
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
        },
      },
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
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true },
        },
      },
    });
  }

  function updateNotifyCount() {
    els.notifyCount.textContent = String(state.records.length);
  }

  async function addParticipant(event) {
    event?.preventDefault?.();
    app.clearFormErrors?.(els.participantForm);

    const name = String(els.participantName.value || "").trim();
    const email = String(els.participantEmail.value || "").trim();

    let hasError = false;
    if (name.length < 2) {
      app.setFieldError?.(els.participantForm, "participantName", "Name must be at least 2 characters.");
      hasError = true;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      app.setFieldError?.(els.participantForm, "participantEmail", "Enter a valid email.");
      hasError = true;
    }
    if (hasError) {
      app.showFormMessage?.(els.participantMessage, "Could not add participant.", "error");
      return;
    }

    try {
      const participant = await app.addSplitParticipant?.({ name, email });
      state.participants = [participant, ...state.participants];
      els.participantForm.reset();
      app.showFormMessage?.(els.participantMessage, "Participant added.", "success");
      renderParticipantCards();
    } catch (error) {
      app.showFormMessage?.(els.participantMessage, error.message, "error");
    }
  }

  async function removeParticipant(id) {
    try {
      await app.removeSplitParticipant?.(id);
      state.participants = state.participants.filter((participant) => String(participant.id) !== String(id));
      renderParticipantCards();
    } catch (error) {
      app.showFormMessage?.(els.participantMessage, error.message, "error");
    }
  }

  async function clearAllParticipants() {
    if (!state.participants.length) {
      return;
    }
    if (!window.confirm("Remove all participants?")) {
      return;
    }

    try {
      await app.clearSplitParticipants?.();
      state.participants = [];
      renderParticipantCards();
      app.showFormMessage?.(els.participantMessage, "All participants removed.", "success");
    } catch (error) {
      app.showFormMessage?.(els.participantMessage, error.message, "error");
    }
  }

  async function saveSplit() {
    try {
      const split = state.current || calculateSplit();
      const saved = await app.saveSplitRecord?.({
        title: split.title,
        amount: split.totalAmount,
        paidBy: split.paidByName,
        participants: {
          category: split.category,
          participantIds: split.participantIds,
          participantNames: split.participantNames,
          breakdown: split.breakdown,
          settlements: split.settlements,
        },
        splitType: split.splitType,
        date: split.date,
      });

      state.records = [normalizeSplitRecord(saved), ...state.records];
      renderFilterParticipants();
      renderHistory();
      renderCharts();
      updateNotifyCount();
      app.showFormMessage?.(els.splitMessage, "Split saved successfully.", "success");
    } catch (error) {
      app.showFormMessage?.(els.splitMessage, error.message, "error");
    }
  }

  async function deleteSplit(id) {
    const target = state.records.find((record) => String(record.id) === String(id));
    if (!target) {
      return;
    }
    if (!window.confirm(`Delete split "${target.title}"?`)) {
      return;
    }

    try {
      await app.deleteSplitRecord?.(id);
      state.records = state.records.filter((record) => String(record.id) !== String(id));
      renderFilterParticipants();
      renderHistory();
      renderCharts();
      updateNotifyCount();
    } catch (error) {
      app.showFormMessage?.(els.splitMessage, error.message, "error");
    }
  }

  function exportSplitCSV(id) {
    const records = id
      ? state.records.filter((record) => String(record.id) === String(id))
      : [...state.records];
    if (!records.length) {
      return;
    }

    const rows = [
      ["Date", "Expense Title", "Amount", "Paid By", "Participants", "Split Method"],
      ...records.map((record) => [
        record.date || "",
        record.title || "",
        String(record.totalAmount || 0),
        record.paidByName || "",
        (record.participantNames || []).join(" | "),
        record.splitType || "",
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

  function bindEvents() {
    els.participantForm.addEventListener("submit", addParticipant);
    els.participantList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-participant]");
      if (button) {
        removeParticipant(button.getAttribute("data-remove-participant"));
      }
    });
    els.clearParticipantsBtn.addEventListener("click", clearAllParticipants);

    els.participantsSelector.addEventListener("change", renderDistributionInputs);
    document.querySelectorAll('input[name="splitMethod"]').forEach((input) => {
      input.addEventListener("change", renderDistributionInputs);
    });

    els.calculateSplitBtn.addEventListener("click", () => {
      try {
        calculateSplit();
        app.showFormMessage?.(els.splitMessage, "Split calculated successfully.", "success");
      } catch (error) {
        app.showFormMessage?.(els.splitMessage, error.message, "error");
      }
    });

    els.saveSplitBtn.addEventListener("click", saveSplit);

    els.splitForm.addEventListener("reset", () => {
      setTimeout(() => {
        els.splitDate.value = todayIso();
        app.clearFormErrors?.(els.splitForm);
        app.showFormMessage?.(els.splitMessage, "", "");
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
      const viewButton = event.target.closest("[data-view-split]");
      const deleteButton = event.target.closest("[data-delete-split]");
      const exportButton = event.target.closest("[data-export-split]");

      if (viewButton) openViewModal(viewButton.getAttribute("data-view-split"));
      if (deleteButton) deleteSplit(deleteButton.getAttribute("data-delete-split"));
      if (exportButton) exportSplitCSV(exportButton.getAttribute("data-export-split"));
    });

    els.exportAllButton.addEventListener("click", () => exportSplitCSV());
    els.closeViewModalBtn.addEventListener("click", closeViewModal);
    els.viewModal.addEventListener("click", (event) => {
      if (event.target === els.viewModal) {
        closeViewModal();
      }
    });

    els.darkModeToggle.addEventListener("change", () => app.setTheme?.(els.darkModeToggle.checked));
  }

  async function boot() {
    if (document.body.dataset.page !== "split") {
      return;
    }

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
    els.exportAllButton = byId("exportAllSplitsBtn");

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

    try {
      await Promise.all([loadParticipants(), loadRecords()]);
    } catch (error) {
      app.showFormMessage?.(els.splitMessage, error.message, "error");
      state.participants = [];
      state.records = [];
    }

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
