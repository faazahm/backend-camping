const jwt = require("jsonwebtoken");
const crypto = require("crypto");

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role || "USER",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

module.exports = { generateVerificationCode, generateToken, generateResetToken };
