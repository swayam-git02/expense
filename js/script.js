(() => {
  const app = (window.ExpenseApp = window.ExpenseApp || {});

  const API_BASE = "http://localhost:5001/api";
  const TOKEN_KEY = "expenseTracker.token";
  const THEME_KEY = "expenseTracker.theme.darkMode";
  const DEFAULT_PROFILE = {
    name: "Alex Carter",
    email: "alex@example.com",
    avatar: "",
    currency: "INR",
    darkMode: false,
    monthlyIncome: 5000,
  };
  const PUBLIC_PAGES = new Set(["", "index.html", "login.html", "register.html", "404.html"]);
  const AVATAR_PRESETS = [
    {
      id: "preset:aurora",
      label: "Aurora",
      start: "#2f6bff",
      end: "#11b981",
      skin: "#ffd7ba",
      shirt: "#153f6f",
      accent: "#fef08a",
      accentStyle: "spark",
    },
    {
      id: "preset:sunrise",
      label: "Sunrise",
      start: "#f97316",
      end: "#ec4899",
      skin: "#ffe1c8",
      shirt: "#6b2148",
      accent: "#fde68a",
      accentStyle: "dot",
    },
    {
      id: "preset:lagoon",
      label: "Lagoon",
      start: "#0f766e",
      end: "#38bdf8",
      skin: "#f5d0b2",
      shirt: "#134e4a",
      accent: "#a7f3d0",
      accentStyle: "leaf",
    },
    {
      id: "preset:ember",
      label: "Ember",
      start: "#ef4444",
      end: "#f59e0b",
      skin: "#ffd9bf",
      shirt: "#7c2d12",
      accent: "#fde68a",
      accentStyle: "spark",
    },
    {
      id: "preset:midnight",
      label: "Midnight",
      start: "#111827",
      end: "#3b82f6",
      skin: "#f4d3ba",
      shirt: "#1d4ed8",
      accent: "#bfdbfe",
      accentStyle: "dot",
    },
    {
      id: "preset:meadow",
      label: "Meadow",
      start: "#22c55e",
      end: "#84cc16",
      skin: "#ffd8b5",
      shirt: "#166534",
      accent: "#dcfce7",
      accentStyle: "leaf",
    },
  ];
  const AVATAR_PRESET_MAP = new Map(AVATAR_PRESETS.map((preset) => [preset.id, preset]));
  const avatarPresetCache = new Map();

  function readThemePreference() {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === "true") {
        return true;
      }
      if (raw === "false") {
        return false;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  function writeThemePreference(enabled) {
    try {
      localStorage.setItem(THEME_KEY, String(Boolean(enabled)));
    } catch (error) {
      // Ignore localStorage write issues and continue with in-memory state.
    }
  }

  let profileCache = {
    ...DEFAULT_PROFILE,
    darkMode: readThemePreference() ?? DEFAULT_PROFILE.darkMode,
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

  function currentMonthValue(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function svgDataUri(svg) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function avatarAccentMarkup(preset) {
    if (preset.accentStyle === "leaf") {
      return `<path d="M46 17c4.8 0 7.8 3.7 7.8 8.2 0 5.1-3.9 8.6-9.6 9.2-.2-5.7 3.5-11.1 9.7-17.4 1 0 1.6.8 1.6 1.8 0 3.4-2.3 6.3-5.7 7.2 2.1.1 3.8.8 5.1 2.1-1.8-7.2-5-11.1-8.9-11.1z" fill="${preset.accent}" opacity="0.92"/>`;
    }

    if (preset.accentStyle === "dot") {
      return `<circle cx="48" cy="18" r="5.5" fill="${preset.accent}" opacity="0.92"/><circle cx="19" cy="48" r="3.4" fill="rgba(255,255,255,0.32)"/>`;
    }

    return `<path d="M47 13l1.7 4.9 5.1.1-4.1 3 1.5 4.8-4.2-3-4.2 3 1.5-4.8-4.1-3 5.1-.1z" fill="${preset.accent}" opacity="0.95"/>`;
  }

  function avatarPresetDataUri(presetId) {
    if (avatarPresetCache.has(presetId)) {
      return avatarPresetCache.get(presetId);
    }

    const preset = AVATAR_PRESET_MAP.get(presetId);
    if (!preset) {
      return "";
    }

    const gradientId = `bg-${preset.id.replace(/[^a-z0-9_-]/gi, "-")}`;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
        <defs>
          <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${preset.start}" />
            <stop offset="100%" stop-color="${preset.end}" />
          </linearGradient>
        </defs>
        <rect width="96" height="96" rx="48" fill="url(#${gradientId})" />
        <circle cx="28" cy="22" r="14" fill="rgba(255,255,255,0.12)" />
        ${avatarAccentMarkup(preset)}
        <path d="M19 80c3.8-13.6 15.1-21 29-21s25.2 7.4 29 21" fill="${preset.shirt}" />
        <circle cx="48" cy="39" r="17.5" fill="${preset.skin}" />
        <path d="M37.5 36.2c1.8 0 3.3 1.5 3.3 3.3s-1.5 3.3-3.3 3.3-3.3-1.5-3.3-3.3 1.5-3.3 3.3-3.3zm21 0c1.8 0 3.3 1.5 3.3 3.3s-1.5 3.3-3.3 3.3-3.3-1.5-3.3-3.3 1.5-3.3 3.3-3.3z" fill="#1f2937" />
        <path d="M40 47.8c2.1 2.4 4.9 3.6 8 3.6s5.9-1.2 8-3.6" fill="none" stroke="#1f2937" stroke-width="2.8" stroke-linecap="round" />
      </svg>
    `;

    const dataUri = svgDataUri(svg);
    avatarPresetCache.set(presetId, dataUri);
    return dataUri;
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
    return svgDataUri(svg);
  }

  function isAvatarPreset(value) {
    return AVATAR_PRESET_MAP.has(String(value || "").trim());
  }

  function resolveAvatarSource(name, avatarValue) {
    const candidate = String(avatarValue || "").trim();
    if (!candidate) {
      return {
        src: avatarDataUri(name),
        isExternal: false,
      };
    }

    if (isAvatarPreset(candidate)) {
      return {
        src: avatarPresetDataUri(candidate),
        isExternal: false,
      };
    }

    return {
      src: candidate,
      isExternal: true,
    };
  }

  function applyAvatarImage(node, name, avatarUrl, options = {}) {
    if (!node) {
      return;
    }

    const fallback = avatarDataUri(name);
    const resolved = resolveAvatarSource(name, avatarUrl);
    const onError = typeof options.onError === "function" ? options.onError : null;

    if (!resolved.isExternal) {
      node.onerror = null;
      node.src = resolved.src;
      return;
    }

    node.onerror = () => {
      node.onerror = null;
      node.src = fallback;
      onError?.();
    };
    node.src = resolved.src;
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

    document.querySelectorAll("[data-user-name]").forEach((node) => {
      node.textContent = name;
    });

    document.querySelectorAll("[data-current-currency]").forEach((node) => {
      node.textContent = currency;
    });

    document.querySelectorAll("[data-user-avatar]").forEach((node) => {
      applyAvatarImage(node, name, settings.avatar);
    });
  }

  app.getToken = getToken;
  app.setToken = setToken;
  app.clearToken = clearToken;
  app.request = request;
  app.generateId = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  app.applyTheme = applyTheme;
  app.refreshUserUi = refreshUserUi;
  app.applyAvatarImage = applyAvatarImage;
  app.createFallbackAvatar = avatarDataUri;
  app.currentMonthValue = currentMonthValue;
  app.getAvatarPresets = () => AVATAR_PRESETS.map(({ id, label }) => ({ id, label }));
  app.isAvatarPreset = isAvatarPreset;
  app.setTheme = (enabled) => {
    const current = app.getSettings();
    profileCache = {
      ...current,
      darkMode: Boolean(enabled),
    };
    writeThemePreference(profileCache.darkMode);
    applyTheme();
  };
  app.getSettings = () =>
    profileCache || {
      ...DEFAULT_PROFILE,
      darkMode: readThemePreference() ?? DEFAULT_PROFILE.darkMode,
    };
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
  app.describeBudgetAlert = (alert, currencyCode) => {
    const spent = app.formatCurrency(alert?.spent || 0, currencyCode);
    const limit = app.formatCurrency(alert?.limit || 0, currencyCode);
    const difference = app.formatCurrency(Math.abs(alert?.remaining || 0), currencyCode);
    const progress = Math.round(Number(alert?.progress || 0));

    if (alert?.severity === "danger") {
      return `${alert?.category || "This category"} is over budget by ${difference}. Spent ${spent} of ${limit}.`;
    }

    return `${alert?.category || "This category"} has used ${progress}% of its budget. ${difference} remaining from ${limit}.`;
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
    writeThemePreference(profileCache.darkMode);
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
    writeThemePreference(profileCache.darkMode);
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
  app.fetchExpenseSummary = (params = {}) => request(`/expenses/summary${buildQuery(params)}`);
  app.fetchNotifications = (params = {}) => request(`/notifications${buildQuery(params)}`);
  app.markNotificationRead = (notificationId) =>
    request(`/notifications/${notificationId}/read`, {
      method: "PUT",
    });
  app.markAllNotificationsRead = () =>
    request("/notifications/read-all", {
      method: "PUT",
    });

  app.createBudget = (payload) =>
    request("/budget", {
      method: "POST",
      body: payload,
    });

  app.fetchBudgets = (params = {}) => request(`/budget${buildQuery(params)}`);
  app.fetchBudgetAlerts = (params = {}) => request(`/budget/alerts${buildQuery(params)}`);

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

  function initLogoutLinks() {
    document.querySelectorAll("[data-logout]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        clearToken();
        profileCache = null;
        window.location.href = "index.html";
      });
    });
  }

  function initLandingThemeToggle() {
    const themeToggle = document.querySelector("[data-theme-toggle]");
    if (!themeToggle) {
      return;
    }

    const labelNode = themeToggle.querySelector("[data-theme-toggle-label]");
    const syncState = () => {
      const isDark = Boolean(app.getSettings().darkMode);
      themeToggle.setAttribute("aria-pressed", String(isDark));
      themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      if (labelNode) {
        labelNode.textContent = isDark ? "Light" : "Dark";
      }
    };

    syncState();
    themeToggle.addEventListener("click", () => {
      const nextTheme = !Boolean(app.getSettings().darkMode);
      app.setTheme(nextTheme);
      syncState();
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
    initLandingThemeToggle();
    initLandingMenu();
    initRevealOnScroll();
    initPasswordToggles();
    initLogoutLinks();
    initLoginForm();
    initRegisterForm();
    await enforceAuth();
  });
})();
