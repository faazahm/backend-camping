const jwt = require("jsonwebtoken");
const { db } = require("../config/db");

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");

  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = parts[1];

  try {
    // 1. Verify Signature & Expiry first (CPU bound, fast)
    // This prevents DB spam with invalid/expired tokens
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // 2. Check Blacklist (I/O bound)
    if (db) {
      const blacklistCheck = await db.query(
        "SELECT id FROM token_blacklist WHERE token = $1",
        [token]
      );
      if (blacklistCheck.rows.length > 0) {
        return res.status(401).json({ message: "Token has been invalidated (logged out)" });
      }
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      username: payload.username,
      role: payload.role || "USER",
    };
    req.token = token; // Attach token for logout use
    return next();
  } catch (err) {
    if (err.message === "Token has been invalidated (logged out)") {
        return res.status(401).json({ message: err.message });
    }
    console.error("Auth Error:", err.message);
    return res.status(401).json({ message: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
}

module.exports = { authenticate, requireAdmin };

