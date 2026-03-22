const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Unauthorized: token missing",
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "change_me_in_production");
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Unauthorized: invalid token",
    });
  }
}

module.exports = authMiddleware;
