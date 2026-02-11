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
    if (!process.env.JWT_SECRET) {
      console.error("[Auth] JWT_SECRET tidak terkonfigurasi di .env");
      return res.status(500).json({ message: "Server configuration error" });
    }

    // 1. Verify Signature & Expiry first
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // 2. Check Blacklist
    if (db) {
      const { rows } = await db.query(
        "SELECT id FROM token_blacklist WHERE token = $1",
        [token]
      );
      if (rows.length > 0) {
        console.warn(`[Auth] Token ditolak: Sudah logout (Blacklisted)`);
        return res.status(401).json({ message: "Sesi telah berakhir, silakan login kembali" });
      }
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      username: payload.username,
      role: payload.role || "USER",
    };
    req.token = token;
    return next();
  } catch (err) {
    console.error(`[Auth] Gagal verifikasi token: ${err.message}`);
    const message = err.name === "TokenExpiredError" 
      ? "Sesi Anda telah berakhir (Expired)" 
      : "Token tidak valid";
    return res.status(401).json({ message });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
}

module.exports = { authenticate, requireAdmin };

