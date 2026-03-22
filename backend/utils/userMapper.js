function mapUserRow(userRow) {
  if (!userRow) {
    return null;
  }

  return {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    avatar: userRow.avatar || "",
    currency: userRow.currency || "INR",
    darkMode: Boolean(userRow.dark_mode),
    monthlyIncome: Number(userRow.monthly_income || 0),
  };
}

module.exports = {
  mapUserRow,
};
