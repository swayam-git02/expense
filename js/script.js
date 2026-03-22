(() => {
  const app = (window.ExpenseApp = window.ExpenseApp || {});

  const API_BASE = "http://localhost:5000/api";
  const TOKEN_KEY = "expenseTracker.token";
  const DEFAULT_PROFILE = {
    name: "Alex Carter",
    email: "alex@example.com",
    avatar: "",
    currency: "INR",
    darkMode: false,
    monthlyIncome: 5000,
  };
  const PUBLIC_PAGES = new Set(["", "index.html", "login.html", "register.html", "404.html"]);

  let profileCache = null;

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

  function currentPageName() {
    const pathname = window.location.pathname || "";
    const page = pathname.split("/").pop();
    return page || "";
  }

  function isPublicPage() {
    return PUBLIC_PAGES.has(currentPageName());
  }

  function buildQuery(params = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      searchParams.set(key, String(value));
    });

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : "";
  }

  function normalizeProfile(rawProfile) {
    if (!rawProfile) {
      return { ...DEFAULT_PROFILE };
    }

    return {
      id: rawProfile.id,
      name: rawProfile.name || DEFAULT_PROFILE.name,
      email: rawProfile.email || DEFAULT_PROFILE.email,
      avatar: rawProfile.avatar || "",
      currency: rawProfile.currency || "INR",
      darkMode: Boolean(rawProfile.darkMode ?? rawProfile.dark_mode ?? false),
      monthlyIncome: Number(rawProfile.monthlyIncome ?? rawProfile.monthly_income ?? DEFAULT_PROFILE.monthlyIncome),
    };
  }

  function initialsFromName(name) {
    const words = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) {
      return "ET";
    }
    return words
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join("");
  }

  function avatarDataUri(name) {
    const initials = initialsFromName(name);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><defs><linearGradient id='grad' x1='0' x2='1' y1='0' y2='1'><stop offset='0%' stop-color='#2f6bff'/><stop offset='100%' stop-color='#11b981'/></linearGradient></defs><rect width='64' height='64' rx='32' fill='url(#grad)'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-family='Arial, sans-serif' font-size='24' fill='white'>${initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  async function request(path, options = {}) {
    const method = options.method || "GET";
    const auth = options.auth !== false;
    const body = options.body;
    const responseType = options.responseType || "json";
    const headers = { ...(options.headers || {}) };

    if (body !== undefined && body !== null && responseType === "json") {
      headers["Content-Type"] = "application/json";
    }

    if (auth) {
      const token = getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body:
        body === undefined || body === null
          ? undefined
          : headers["Content-Type"] === "application/json"
            ? JSON.stringify(body)
            : body,
    });

    if (responseType === "text") {
      const textBody = await response.text();
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      return textBody;
    }

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok) {
      if (response.status === 401 && auth) {
        clearToken();
        profileCache = null;
        if (!isPublicPage()) {
          window.location.href = "login.html";
        }
      }

      throw new Error(payload.message || `Request failed (${response.status})`);
    }

    return payload.data !== undefined ? payload.data : payload;
  }

  function applyTheme() {
    const settings = app.getSettings();
    document.documentElement.setAttribute("data-theme", settings.darkMode ? "dark" : "light");
  }

  function refreshUserUi() {
    const settings = app.getSettings();
    const name = settings.name || DEFAULT_PROFILE.name;
    const currency = settings.currency || "INR";
    const avatar = settings.avatar || avatarDataUri(name);

    document.querySelectorAll("[data-user-name]").forEach((node) => {
      node.textContent = name;
    });

    document.querySelectorAll("[data-current-currency]").forEach((node) => {
      node.textContent = currency;
    });

    document.querySelectorAll("[data-user-avatar]").forEach((node) => {
      node.src = avatar;
    });
  }

  app.getToken = getToken;
  app.setToken = setToken;
  app.clearToken = clearToken;
  app.request = request;
  app.generateId = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  app.applyTheme = applyTheme;
  app.refreshUserUi = refreshUserUi;
  app.setTheme = (enabled) => {
    const current = app.getSettings();
    profileCache = {
      ...current,
      darkMode: Boolean(enabled),
    };
    applyTheme();
  };
  app.getSettings = () => profileCache || { ...DEFAULT_PROFILE };
  app.formatCurrency = (amount, currencyCode) => {
    const settings = app.getSettings();
    const currency = currencyCode || settings.currency || "INR";
    const numeric = Number(amount) || 0;

    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(numeric);
    } catch (error) {
      return `${currency} ${numeric.toFixed(2)}`;
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

  app.clearFormErrors = (form) => {
    if (!form) {
      return;
    }

    form.querySelectorAll(".input-error").forEach((errorNode) => {
      errorNode.textContent = "";
    });

    form.querySelectorAll("input, select, textarea").forEach((fieldNode) => {
      fieldNode.classList.remove("error");
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

  app.register = (payload) =>
    request("/auth/register", {
      method: "POST",
      body: payload,
      auth: false,
    });

  app.login = (payload) =>
    request("/auth/login", {
      method: "POST",
      body: payload,
      auth: false,
    });

  app.fetchProfile = async () => {
    const profile = await request("/user/profile");
    profileCache = normalizeProfile(profile);
    refreshUserUi();
    applyTheme();
    return profileCache;
  };

  app.updateProfile = async (payload) => {
    const profile = await request("/user/profile", {
      method: "PUT",
      body: payload,
    });
    profileCache = normalizeProfile(profile);
    refreshUserUi();
    applyTheme();
    return profileCache;
  };

  app.updatePassword = (payload) =>
    request("/user/profile/password", {
      method: "PUT",
      body: payload,
    });

  app.fetchExpenses = (params = {}) =>
    request(`/expenses${buildQuery(params)}`);

  app.createExpense = (payload) =>
    request("/expenses", {
      method: "POST",
      body: payload,
    });

  app.updateExpense = (expenseId, payload) =>
    request(`/expenses/${expenseId}`, {
      method: "PUT",
      body: payload,
    });

  app.deleteExpense = (expenseId) =>
    request(`/expenses/${expenseId}`, {
      method: "DELETE",
    });

  app.fetchExpenseAnalytics = () => request("/expenses/analytics");

  app.createBudget = (payload) =>
    request("/budget", {
      method: "POST",
      body: payload,
    });

  app.fetchBudgets = (params = {}) => request(`/budget${buildQuery(params)}`);

  app.fetchSplitRecords = () => request("/split");
  app.saveSplitRecord = (payload) =>
    request("/split", {
      method: "POST",
      body: payload,
    });
  app.deleteSplitRecord = (splitId) =>
    request(`/split/${splitId}`, {
      method: "DELETE",
    });

  app.fetchSplitParticipants = () => request("/split/participants");
  app.addSplitParticipant = (payload) =>
    request("/split/participants", {
      method: "POST",
      body: payload,
    });
  app.removeSplitParticipant = (participantId) =>
    request(`/split/participants/${participantId}`, {
      method: "DELETE",
    });
  app.clearSplitParticipants = () =>
    request("/split/participants", {
      method: "DELETE",
    });

  function initLandingMenu() {
    const toggleButton = document.querySelector("[data-menu-toggle]");
    const menu = document.querySelector("[data-menu]");
    if (!toggleButton || !menu) {
      return;
    }

    toggleButton.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("open");
      toggleButton.setAttribute("aria-expanded", String(isOpen));
    });

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        if (!menu.classList.contains("open")) {
          return;
        }
        menu.classList.remove("open");
        toggleButton.setAttribute("aria-expanded", "false");
      });
    });
  }

  function initRevealOnScroll() {
    const revealNodes = document.querySelectorAll(".reveal");
    if (!revealNodes.length) {
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

    revealNodes.forEach((node) => observer.observe(node));
  }

  function initPasswordToggles() {
    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-target");
        const input = targetId ? byId(targetId) : null;
        if (!input) {
          return;
        }

        const nextType = input.type === "password" ? "text" : "password";
        input.type = nextType;
        button.textContent = nextType === "password" ? "Show" : "Hide";
      });
    });
  }

  function byId(id) {
    return document.getElementById(id);
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
    const form = byId("loginForm");
    if (!form) {
      return;
    }

    const messageNode = byId("loginMessage");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      app.clearFormErrors(form);
      app.showFormMessage(messageNode, "", "");

      const formData = new FormData(form);
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const password = String(formData.get("password") || "");

      let hasError = false;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        app.setFieldError(form, "email", "Enter a valid email.");
        hasError = true;
      }
      if (password.length < 6) {
        app.setFieldError(form, "password", "Password must be at least 6 characters.");
        hasError = true;
      }
      if (hasError) {
        app.showFormMessage(messageNode, "Please fix the highlighted fields.", "error");
        return;
      }

      try {
        const response = await app.login({ email, password });
        app.setToken(response.token);
        profileCache = normalizeProfile(response.user);
        refreshUserUi();
        applyTheme();
        app.showFormMessage(messageNode, "Login successful. Redirecting...", "success");
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 400);
      } catch (error) {
        app.showFormMessage(messageNode, error.message, "error");
      }
    });
  }

  function initRegisterForm() {
    const form = byId("registerForm");
    if (!form) {
      return;
    }

    const passwordInput = byId("registerPassword");
    const strengthBar = byId("passwordStrengthBar");
    const strengthText = byId("passwordStrengthText");
    const messageNode = byId("registerMessage");

    function updateStrength() {
      const status = passwordStrength(passwordInput?.value || "");
      if (strengthBar) {
        strengthBar.style.width = `${status.width}%`;
        strengthBar.className = status.className;
      }
      if (strengthText) {
        strengthText.textContent = status.label;
      }
    }

    passwordInput?.addEventListener("input", updateStrength);
    updateStrength();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      app.clearFormErrors(form);
      app.showFormMessage(messageNode, "", "");

      const formData = new FormData(form);
      const fullName = String(formData.get("fullName") || "").trim();
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const password = String(formData.get("password") || "");
      const confirmPassword = String(formData.get("confirmPassword") || "");

      let hasError = false;
      if (fullName.length < 3) {
        app.setFieldError(form, "fullName", "Name must be at least 3 characters.");
        hasError = true;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        app.setFieldError(form, "email", "Enter a valid email.");
        hasError = true;
      }
      if (password.length < 8) {
        app.setFieldError(form, "password", "Password must be at least 8 characters.");
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

      try {
        const response = await app.register({
          name: fullName,
          email,
          password,
        });
        app.setToken(response.token);
        profileCache = normalizeProfile(response.user);
        refreshUserUi();
        applyTheme();
        app.showFormMessage(messageNode, "Registration successful. Redirecting...", "success");
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 500);
      } catch (error) {
        app.showFormMessage(messageNode, error.message, "error");
      }
    });
  }

  async function enforceAuth() {
    if (isPublicPage()) {
      return;
    }

    if (!getToken()) {
      window.location.href = "login.html";
      return;
    }

    try {
      await app.fetchProfile();
    } catch (error) {
      clearToken();
      window.location.href = "login.html";
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    applyTheme();
    initLandingMenu();
    initRevealOnScroll();
    initPasswordToggles();
    initLoginForm();
    initRegisterForm();
    await enforceAuth();
  });
})();
