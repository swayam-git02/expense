(() => {
  const app = window.ExpenseApp || {};

  function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function control(form, name) {
    return form?.elements?.namedItem(name);
  }

  function setDefaultDate(form) {
    const dateInput = form?.querySelector('[name="date"]');
    if (!dateInput || dateInput.value) {
      return;
    }

    dateInput.value = todayIsoDate();
  }

  function readExpenseFromForm(form) {
    const title = control(form, "title");
    const amount = control(form, "amount");
    const category = control(form, "category");
    const date = control(form, "date");
    const payment = control(form, "payment");
    const notes = control(form, "notes");

    return {
      title: String(title?.value || "").trim(),
      amount: Number(amount?.value || 0),
      category: String(category?.value || ""),
      date: String(date?.value || ""),
      payment: String(payment?.value || ""),
      notes: String(notes?.value || "").trim(),
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

  function initAddExpensePage() {
    const form = document.getElementById("addExpenseForm");
    if (!form) {
      return;
    }

    const messageNode = document.getElementById("addExpenseMessage");
    setDefaultDate(form);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const expense = readExpenseFromForm(form);
      if (!validateExpenseForm(form, expense)) {
        app.showFormMessage?.(messageNode, "Please fix the form errors.", "error");
        return;
      }

      const expenses = app.getExpenses ? app.getExpenses() : [];
      expenses.push({
        ...expense,
        id: app.generateId ? app.generateId() : String(Date.now()),
      });
      app.saveExpenses?.(expenses);

      form.reset();
      setDefaultDate(form);
      app.showFormMessage?.(messageNode, "Expense saved successfully.", "success");
    });

    form.addEventListener("reset", () => {
      app.clearFormErrors?.(form);
      app.showFormMessage?.(messageNode, "", "");
      setTimeout(() => setDefaultDate(form), 0);
    });
  }

  function initExpensesPage() {
    const tableBody = document.getElementById("expensesTableBody");
    if (!tableBody) {
      return;
    }

    const searchInput = document.getElementById("searchExpenses");
    const categoryFilter = document.getElementById("filterCategory");
    const sortSelect = document.getElementById("sortDate");

    const modal = document.getElementById("deleteModal");
    const modalText = document.getElementById("deleteModalText");
    const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

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

    function filteredExpenses() {
      const expenses = app.getExpenses ? app.getExpenses() : [];
      const search = searchInput?.value?.trim().toLowerCase() || "";
      const category = categoryFilter?.value || "all";
      const sort = sortSelect?.value || "newest";

      let result = expenses.filter((expense) => {
        const searchable = `${expense.title} ${expense.category} ${expense.payment} ${expense.notes} ${expense.date}`.toLowerCase();
        const matchesSearch = !search || searchable.includes(search);
        const matchesCategory = category === "all" || expense.category === category;
        return matchesSearch && matchesCategory;
      });

      result.sort((a, b) => {
        const first = new Date(a.date || 0).getTime();
        const second = new Date(b.date || 0).getTime();
        return sort === "oldest" ? first - second : second - first;
      });

      return result;
    }

    function renderExpenses() {
      const expenses = filteredExpenses();
      const currency = app.getSettings?.().currency || "USD";
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
        const title = button.getAttribute("data-title") || "this expense";
        openDeleteModal(id, title);
      }
    });

    cancelDeleteBtn?.addEventListener("click", closeDeleteModal);
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeDeleteModal();
      }
    });

    confirmDeleteBtn?.addEventListener("click", () => {
      if (!deleteId) {
        return;
      }

      const expenses = app.getExpenses ? app.getExpenses() : [];
      const nextExpenses = expenses.filter((item) => item.id !== deleteId);
      app.saveExpenses?.(nextExpenses);
      closeDeleteModal();
      renderExpenses();
    });

    renderExpenses();
  }

  function initEditExpensePage() {
    const form = document.getElementById("editExpenseForm");
    if (!form) {
      return;
    }

    const notFound = document.getElementById("editNotFound");
    const panel = document.getElementById("editExpensePanel");
    const messageNode = document.getElementById("editExpenseMessage");
    const params = new URLSearchParams(window.location.search);
    const expenseId = params.get("id");

    if (!expenseId) {
      notFound?.classList.remove("hidden-state");
      panel?.classList.add("hidden-state");
      return;
    }

    const expenses = app.getExpenses ? app.getExpenses() : [];
    const existing = expenses.find((item) => item.id === expenseId);

    if (!existing) {
      notFound?.classList.remove("hidden-state");
      panel?.classList.add("hidden-state");
      return;
    }

    if (notFound) {
      notFound.classList.add("hidden-state");
    }

    const idField = control(form, "expenseId");
    const titleField = control(form, "title");
    const amountField = control(form, "amount");
    const categoryField = control(form, "category");
    const dateField = control(form, "date");
    const paymentField = control(form, "payment");
    const notesField = control(form, "notes");

    if (idField) idField.value = existing.id;
    if (titleField) titleField.value = existing.title;
    if (amountField) amountField.value = String(existing.amount);
    if (categoryField) categoryField.value = existing.category;
    if (dateField) dateField.value = existing.date;
    if (paymentField) paymentField.value = existing.payment;
    if (notesField) notesField.value = existing.notes || "";

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const updatedExpense = readExpenseFromForm(form);
      if (!validateExpenseForm(form, updatedExpense)) {
        app.showFormMessage?.(messageNode, "Please fix the form errors.", "error");
        return;
      }

      const allExpenses = app.getExpenses ? app.getExpenses() : [];
      const index = allExpenses.findIndex((item) => item.id === expenseId);
      if (index < 0) {
        app.showFormMessage?.(messageNode, "Expense no longer exists.", "error");
        return;
      }

      allExpenses[index] = {
        ...allExpenses[index],
        ...updatedExpense,
      };
      app.saveExpenses?.(allExpenses);
      app.showFormMessage?.(messageNode, "Expense updated. Redirecting...", "success");
      setTimeout(() => {
        window.location.href = "expenses.html";
      }, 650);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initAddExpensePage();
    initExpensesPage();
    initEditExpensePage();
  });
})();
