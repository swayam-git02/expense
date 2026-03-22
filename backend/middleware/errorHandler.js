function notFound(_req, res, _next) {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
}

function errorHandler(error, _req, res, _next) {
  console.error(error);
  res.status(error.status || 500).json({
    success: false,
    message: error.message || "Internal server error",
  });
}

module.exports = {
  notFound,
  errorHandler,
};
