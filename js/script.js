(() => {
  const app = (window.ExpenseApp = window.ExpenseApp || {});
  const KEYS = {
    expenses: "expenseTracker.expenses",
    settings: "expenseTracker.settings",
    user: "expenseTracker.user",
  };

  const DEFAULT_SETTINGS = {
    name: "Alex Carter",
    email: "alex@example.com",
    avatar: "",
    currency: "USD",
    darkMode: false,
    monthlyIncome: 5000,
  };

  function safeParse(value, fallback) {
    if (!value) {
      return fallback;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function initialsFromName(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!parts.length) {
      return "ET";
    }

    return parts
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }

  function avatarDataUri(name) {
    const initials = initialsFromName(name);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop offset='0%' stop-color='#2f6bff'/><stop offset='100%' stop-color='#11b981'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(#g)'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='24' fill='white'>${initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function normalizeExpense(item) {
    const amount = Number(item.amount);
    return {
      id: item.id || app.generateId(),
      title: String(item.title || ""),
      amount: Number.isFinite(amount) ? amount : 0,
      category: String(item.category || "Other"),
      date: String(item.date || ""),
      payment: String(item.payment || "Cash"),
      notes: String(item.notes || ""),
    };
  }

  function updateUserElements() {
    const settings = app.getSettings();
    const name = settings.name || DEFAULT_SETTINGS.name;
    const currency = settings.currency || "USD";

    document.querySelectorAll("[data-user-name]").forEach((node) => {
      node.textContent = name;
    });

    document.querySelectorAll("[data-current-currency]").forEach((node) => {
      node.textContent = currency;
    });

    document.querySelectorAll("[data-user-avatar]").forEach((node) => {
      node.src = settings.avatar || avatarDataUri(name);
    });
  }

  app.generateId = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  app.getExpenses = () => {
    const raw = safeParse(localStorage.getItem(KEYS.expenses), []);
    return Array.isArray(raw) ? raw.map(normalizeExpense) : [];
  };

  app.saveExpenses = (expenses) => {
    localStorage.setItem(KEYS.expenses, JSON.stringify(expenses || []));
  };

  app.getSettings = () => {
    const settings = safeParse(localStorage.getItem(KEYS.settings), {});
    return {
      ...DEFAULT_SETTINGS,
      ...(settings || {}),
      monthlyIncome: Number(settings?.monthlyIncome ?? DEFAULT_SETTINGS.monthlyIncome),
      darkMode: Boolean(settings?.darkMode),
    };
  };

  app.saveSettings = (settings) => {
    localStorage.setItem(KEYS.settings, JSON.stringify(settings));
  };

  app.getUser = () => {
    const user = safeParse(localStorage.getItem(KEYS.user), {});
    return user && typeof user === "object" ? user : {};
  };

  app.saveUser = (user) => {
    localStorage.setItem(KEYS.user, JSON.stringify(user || {}));
  };

  app.getMonthlyIncome = () => {
    const value = Number(app.getSettings().monthlyIncome);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_SETTINGS.monthlyIncome;
  };

  app.formatCurrency = (amount, currencyCode) => {
    const currency = currencyCode || app.getSettings().currency || "USD";
    const numeric = Number(amount) || 0;

    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(numeric);
    } catch (error) {
      return `${currency} ${numeric.toFixed(2)}`;
    }
  };

  app.clearFormErrors = (form) => {
    if (!form) {
      return;
    }

    form.querySelectorAll(".input-error").forEach((node) => {
      node.textContent = "";
    });

    form.querySelectorAll("input, select, textarea").forEach((node) => {
      node.classList.remove("error");
    });
  };

  app.setFieldError = (form, fieldName, message) => {
    const errorNode = form.querySelector(`[data-error-for="${fieldName}"]`);
    const field = form.querySelector(`[name="${fieldName}"]`);

    if (errorNode) {
      errorNode.textContent = message || "";
    }

    if (field) {
      field.classList.toggle("error", Boolean(message));
    }
  };

  app.showFormMessage = (node, message, type) => {
    if (!node) {
      return;
    }

    node.textContent = message || "";
    node.classList.remove("success", "error");
    if (type) {
      node.classList.add(type);
    }
  };

  app.applyTheme = () => {
    const dark = Boolean(app.getSettings().darkMode);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  };

  app.setTheme = (enabled) => {
    const settings = app.getSettings();
    settings.darkMode = Boolean(enabled);
    app.saveSettings(settings);
    app.applyTheme();
  };

  app.refreshUserUi = updateUserElements;

  function initLandingMenu() {
    const toggle = document.querySelector("[data-menu-toggle]");
    const menu = document.querySelector("[data-menu]");

    if (!toggle || !menu) {
      return;
    }

    toggle.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        if (!menu.classList.contains("open")) {
          return;
        }

        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function initRevealOnScroll() {
    const nodes = document.querySelectorAll(".reveal");
    if (!nodes.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16 }
    );

    nodes.forEach((node) => observer.observe(node));
  }

  function initPasswordToggles() {
    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-target");
        const input = targetId ? document.getElementById(targetId) : null;
        if (!input) {
          return;
        }

        const nextType = input.type === "password" ? "text" : "password";
        input.type = nextType;
        button.textContent = nextType === "password" ? "Show" : "Hide";
      });
    });
  }

  function passwordStrength(password) {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (!password) {
      return { label: "Password strength", width: 0, className: "" };
    }

    if (score <= 2) {
      return { label: "Weak password", width: 35, className: "strength-weak" };
    }

    if (score <= 4) {
      return { label: "Medium password", width: 70, className: "strength-medium" };
    }

    return { label: "Strong password", width: 100, className: "strength-strong" };
  }

  function initLoginForm() {
    const form = document.getElementById("loginForm");
    if (!form) {
      return;
    }

    const messageNode = document.getElementById("loginMessage");

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      app.clearFormErrors(form);
      app.showFormMessage(messageNode, "", "");

      const formData = new FormData(form);
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "");
      const user = app.getUser();

      let hasError = false;

      if (!isValidEmail(email)) {
        app.setFieldError(form, "email", "Enter a valid email address.");
        hasError = true;
      }

      if (password.length < 6) {
        app.setFieldError(form, "password", "Password must be at least 6 characters.");
        hasError = true;
      }

      if (!hasError && user.email && email.toLowerCase() !== String(user.email).toLowerCase()) {
        app.setFieldError(form, "email", "This email is not registered.");
        hasError = true;
      }

      if (!hasError && user.password && password !== user.password) {
        app.setFieldError(form, "password", "Incorrect password.");
        hasError = true;
      }

      if (hasError) {
        app.showFormMessage(messageNode, "Please fix the highlighted fields.", "error");
        return;
      }

      if (!user.email) {
        app.saveUser({
          name: DEFAULT_SETTINGS.name,
          email,
          password,
        });
      }

      app.showFormMessage(messageNode, "Login successful. Redirecting...", "success");
      setTimeout(() => {
        window.location.href = "dashboard.html";
      }, 600);
    });
  }

  function initRegisterForm() {
    const form = document.getElementById("registerForm");
    if (!form) {
      return;
    }

    const passwordInput = document.getElementById("registerPassword");
    const bar = document.getElementById("passwordStrengthBar");
    const text = document.getElementById("passwordStrengthText");
    const messageNode = document.getElementById("registerMessage");

    function updateStrength() {
      if (!passwordInput || !bar || !text) {
        return;
      }

      const status = passwordStrength(passwordInput.value);
      bar.style.width = `${status.width}%`;
      bar.className = status.className;
      text.textContent = status.label;
    }

    passwordInput?.addEventListener("input", updateStrength);
    updateStrength();

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      app.clearFormErrors(form);
      app.showFormMessage(messageNode, "", "");

      const formData = new FormData(form);
      const fullName = String(formData.get("fullName") || "").trim();
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "");
      const confirmPassword = String(formData.get("confirmPassword") || "");

      let hasError = false;

      if (fullName.length < 3) {
        app.setFieldError(form, "fullName", "Name must be at least 3 characters.");
        hasError = true;
      }

      if (!isValidEmail(email)) {
        app.setFieldError(form, "email", "Enter a valid email address.");
        hasError = true;
      }

      if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
        app.setFieldError(
          form,
          "password",
          "Use 8+ chars with uppercase, lowercase, and a number."
        );
        hasError = true;
      }

      if (confirmPassword !== password) {
        app.setFieldError(form, "confirmPassword", "Passwords do not match.");
        hasError = true;
      }

      if (hasError) {
        app.showFormMessage(messageNode, "Please correct the form errors.", "error");
        return;
      }

      app.saveUser({
        name: fullName,
        email,
        password,
      });

      const settings = app.getSettings();
      settings.name = fullName;
      settings.email = email;
      app.saveSettings(settings);
      updateUserElements();

      app.showFormMessage(messageNode, "Registration successful. Redirecting to login...", "success");
      setTimeout(() => {
        window.location.href = "login.html";
      }, 700);
    });
  }

  function bootDefaults() {
    const settings = safeParse(localStorage.getItem(KEYS.settings), null);
    if (!settings) {
      app.saveSettings(DEFAULT_SETTINGS);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootDefaults();
    app.applyTheme();
    updateUserElements();
    initLandingMenu();
    initRevealOnScroll();
    initPasswordToggles();
    initLoginForm();
    initRegisterForm();
  });
})();
