const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { initializeDatabase } = require("./config/db");
const authRoutes = require("./routes/auth");
const expensesRoutes = require("./routes/expenses");
const splitRoutes = require("./routes/split");
const budgetRoutes = require("./routes/budget");
const userRoutes = require("./routes/user");
const notificationsRoutes = require("./routes/notifications");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "Expense Tracker API is running",
    health: "/api/health",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Expense Tracker backend is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/split", splitRoutes);
app.use("/api/budget", budgetRoutes);
app.use("/api/user", userRoutes);
app.use("/api/notifications", notificationsRoutes);

app.use(notFound);
app.use(errorHandler);

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error.message);
    process.exit(1);
  });
