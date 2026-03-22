(() => {
  const app = window.ExpenseApp || {};
  let cachedExpenses = [];

  function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function control(form, name) {
    return form?.elements?.namedItem(name);
  }

  function setDefaultDate(form) {
    const dateInput = form?.querySelector('[name="date"]');
    if (dateInput && !dateInput.value) {
      dateInput.value = todayIsoDate();
    }
  }

  function readExpenseFromForm(form) {
    return {
      title: String(control(form, "title")?.value || "").trim(),
      amount: Number(control(form, "amount")?.value || 0),
      category: String(control(form, "category")?.value || ""),
      date: String(control(form, "date")?.value || ""),
      payment: String(control(form, "payment")?.value || ""),
      notes: String(control(form, "notes")?.value || "").trim(),
    };
  }

  function validateExpenseForm(form, expense) {
    app.clearFormErrors?.(form);
    let hasError = false;

    if (!expense.title || expense.title.length < 2) {
      app.setFieldError?.(form, "title", "Title must be at least 2 characters.");
      hasError = true;
    }
    if (!Number.isFinite(expense.amount) || expense.amount <= 0) {
      app.setFieldError?.(form, "amount", "Amount must be greater than 0.");
      hasError = true;
    }
    if (!expense.category) {
      app.setFieldError?.(form, "category", "Please select a category.");
      hasError = true;
    }
    if (!expense.date) {
      app.setFieldError?.(form, "date", "Please choose a date.");
      hasError = true;
    }
    if (!expense.payment) {
      app.setFieldError?.(form, "payment", "Please select a payment method.");
      hasError = true;
    }

    return !hasError;
  }

  async function initAddExpensePage() {
    const form = document.getElementById("addExpenseForm");
    if (!form) {
      return;
    }

    const messageNode = document.getElementById("addExpenseMessage");
    setDefaultDate(form);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const expense = readExpenseFromForm(form);
      if (!validateExpenseForm(form, expense)) {
        app.showFormMessage?.(messageNode, "Please fix the form errors.", "error");
        return;
      }

      try {
        await app.createExpense?.(expense);
        form.reset();
        setDefaultDate(form);
        app.showFormMessage?.(messageNode, "Expense saved successfully.", "success");
      } catch (error) {
        app.showFormMessage?.(messageNode, error.message, "error");
      }
    });

    form.addEventListener("reset", () => {
      app.clearFormErrors?.(form);
      app.showFormMessage?.(messageNode, "", "");
      setTimeout(() => setDefaultDate(form), 0);
    });
  }

  function getFilteredExpenses(searchInput, categoryFilter, sortSelect) {
    const search = searchInput?.value?.trim().toLowerCase() || "";
    const category = categoryFilter?.value || "all";
    const sort = sortSelect?.value || "newest";

    const filtered = cachedExpenses.filter((expense) => {
      const searchable = `${expense.title} ${expense.category} ${expense.payment} ${expense.notes} ${expense.date}`.toLowerCase();
      const matchesSearch = !search || searchable.includes(search);
      const matchesCategory = category === "all" || expense.category === category;
      return matchesSearch && matchesCategory;
    });

    filtered.sort((a, b) => {
      const first = new Date(a.date || 0).getTime();
      const second = new Date(b.date || 0).getTime();
      return sort === "oldest" ? first - second : second - first;
    });

    return filtered;
  }

  async function initExpensesPage() {
    const tableBody = document.getElementById("expensesTableBody");
    if (!tableBody) {
      return;
    }

    const searchInput = document.getElementById("searchExpenses");
    const categoryFilter = document.getElementById("filterCategory");
    const sortSelect = document.getElementById("sortDate");

    const modal = document.getElementById("deleteModal");
    const modalText = document.getElementById("deleteModalText");
    const cancelDeleteButton = document.getElementById("cancelDeleteBtn");
    const confirmDeleteButton = document.getElementById("confirmDeleteBtn");

    let deleteId = null;

    function openDeleteModal(id, title) {
      deleteId = id;
      if (modalText) {
        modalText.textContent = `Delete "${title}"? This action cannot be undone.`;
      }
      modal?.classList.add("show");
      modal?.setAttribute("aria-hidden", "false");
    }

    function closeDeleteModal() {
      deleteId = null;
      modal?.classList.remove("show");
      modal?.setAttribute("aria-hidden", "true");
    }

    function renderExpenses() {
      const expenses = getFilteredExpenses(searchInput, categoryFilter, sortSelect);
      const currency = app.getSettings?.().currency || "INR";
      tableBody.innerHTML = "";

      if (!expenses.length) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6">
              <div class="empty-state">No expenses match your filters.</div>
            </td>
          </tr>
        `;
        return;
      }

      expenses.forEach((expense) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${expense.date || "-"}</td>
          <td>${expense.title}</td>
          <td>${expense.category}</td>
          <td>${app.formatCurrency?.(expense.amount, currency)}</td>
          <td>${expense.payment}</td>
          <td>
            <div class="table-actions">
              <button class="action-btn edit" type="button" data-action="edit" data-id="${expense.id}">Edit</button>
              <button class="action-btn delete" type="button" data-action="delete" data-id="${expense.id}" data-title="${expense.title.replace(/"/g, "&quot;")}">Delete</button>
            </div>
          </td>
        `;
        tableBody.appendChild(row);
      });
    }

    async function loadExpenses() {
      try {
        cachedExpenses = await app.fetchExpenses?.();
      } catch (error) {
        cachedExpenses = [];
        tableBody.innerHTML = `
          <tr>
            <td colspan="6">
              <div class="empty-state">${error.message}</div>
            </td>
          </tr>
        `;
        return;
      }
      renderExpenses();
    }

    searchInput?.addEventListener("input", renderExpenses);
    categoryFilter?.addEventListener("change", renderExpenses);
    sortSelect?.addEventListener("change", renderExpenses);

    tableBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      const action = button.getAttribute("data-action");
      const id = button.getAttribute("data-id");
      if (action === "edit") {
        window.location.href = `edit-expense.html?id=${encodeURIComponent(id || "")}`;
        return;
      }

      if (action === "delete" && id) {
        openDeleteModal(id, button.getAttribute("data-title") || "this expense");
      }
    });

    cancelDeleteButton?.addEventListener("click", closeDeleteModal);
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeDeleteModal();
      }
    });

    confirmDeleteButton?.addEventListener("click", async () => {
      if (!deleteId) {
        return;
      }
      try {
        await app.deleteExpense?.(deleteId);
        closeDeleteModal();
        await loadExpenses();
      } catch (error) {
        closeDeleteModal();
        tableBody.innerHTML = `
          <tr>
            <td colspan="6">
              <div class="empty-state">${error.message}</div>
            </td>
          </tr>
        `;
      }
    });

    await loadExpenses();
  }

  async function initEditExpensePage() {
    const form = document.getElementById("editExpenseForm");
    if (!form) {
      return;
    }

    const notFound = document.getElementById("editNotFound");
    const panel = document.getElementById("editExpensePanel");
    const messageNode = document.getElementById("editExpenseMessage");
    const expenseId = new URLSearchParams(window.location.search).get("id");

    if (!expenseId) {
      notFound?.classList.remove("hidden-state");
      panel?.classList.add("hidden-state");
      return;
    }

    let existing = null;
    try {
      const expenses = await app.fetchExpenses?.();
      existing = (expenses || []).find((item) => String(item.id) === String(expenseId));
    } catch (error) {
      existing = null;
    }

    if (!existing) {
      notFound?.classList.remove("hidden-state");
      panel?.classList.add("hidden-state");
      return;
    }

    notFound?.classList.add("hidden-state");

    if (control(form, "expenseId")) control(form, "expenseId").value = existing.id;
    if (control(form, "title")) control(form, "title").value = existing.title;
    if (control(form, "amount")) control(form, "amount").value = String(existing.amount);
    if (control(form, "category")) control(form, "category").value = existing.category;
    if (control(form, "date")) control(form, "date").value = existing.date;
    if (control(form, "payment")) control(form, "payment").value = existing.payment;
    if (control(form, "notes")) control(form, "notes").value = existing.notes || "";

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const updatedExpense = readExpenseFromForm(form);
      if (!validateExpenseForm(form, updatedExpense)) {
        app.showFormMessage?.(messageNode, "Please fix the form errors.", "error");
        return;
      }

      try {
        await app.updateExpense?.(expenseId, updatedExpense);
        app.showFormMessage?.(messageNode, "Expense updated. Redirecting...", "success");
        setTimeout(() => {
          window.location.href = "expenses.html";
        }, 450);
      } catch (error) {
        app.showFormMessage?.(messageNode, error.message, "error");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await initAddExpensePage();
    await initExpensesPage();
    await initEditExpensePage();
  });
})();
