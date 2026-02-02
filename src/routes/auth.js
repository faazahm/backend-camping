const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { db } = require("../config/db");
const { mailTransporter } = require("../config/email");
const { googleClient } = require("../config/google");
const { generateVerificationCode, generateToken, generateResetToken } = require("../utils/auth");
const { authenticate } = require("../middleware/auth");
const jwt = require("jsonwebtoken");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

const authRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Manajemen otentikasi pengguna
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Mendaftar pengguna baru
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - username
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Berhasil mendaftar
 *       400:
 *         description: Email atau username sudah digunakan
 */
authRouter.use(authLimiter);

authRouter.post("/register", async (req, res) => {
  try {
    if (!db) {
      return res
        .status(500)
        .json({ message: "Database is not configured on the server" });
    }

    if (!mailTransporter) {
      return res
        .status(500)
        .json({ message: "Email is not configured on the server" });
    }

    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res
        .status(400)
        .json({ message: "Email, username, and password are required" });
    }

    const { rows: existing } = await db.query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "Email or username already used" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();

    const result = await db.query(
      "INSERT INTO users (email, username, password_hash, is_verified, verification_code) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [email, username, passwordHash, false, verificationCode]
    );

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: "Kode verifikasi akun",
      text: `Kode verifikasi kamu adalah: ${verificationCode}`,
    };

    await mailTransporter.sendMail(mailOptions);

    return res.status(201).json({
      message: "Signup berhasil, cek email untuk kode verifikasi",
      userId: result.rows[0].id,
    });
  } catch (err) {
    console.error("Google Login Error:", err); // Log error lebih detail
    return res.status(500).json({ 
      message: "Internal server error", 
      error: err.message // Kirim pesan error asli ke frontend agar kelihatan di console
    });
  }
});

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     summary: Verifikasi email pengguna
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email berhasil diverifikasi
 *       400:
 *         description: Kode salah atau user tidak ditemukan
 */
authRouter.post("/verify-email", async (req, res) => {
  try {
    if (!db) {
      return res
        .status(500)
        .json({ message: "Database is not configured on the server" });
    }

    const { email, code } = req.body;

    if (!email || !code) {
      return res
        .status(400)
        .json({ message: "Email dan kode verifikasi wajib diisi" });
    }

    const { rows } = await db.query(
      "SELECT id, is_verified, verification_code, email, username, role FROM users WHERE email = $1",
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: "User tidak ditemukan" });
    }

    const user = rows[0];

    if (user.is_verified) {
      return res.status(400).json({ message: "Email sudah terverifikasi" });
    }

    if (user.verification_code !== code) {
      return res.status(400).json({ message: "Kode verifikasi salah" });
    }

    await db.query(
      "UPDATE users SET is_verified = true, verification_code = NULL WHERE id = $1",
      [user.id]
    );

    const token = generateToken(user);

    return res.json({
      message: "Email berhasil diverifikasi",
      token,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login pengguna
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - password
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email atau Username
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login berhasil
 *       400:
 *         description: Data tidak valid atau password salah
 */
authRouter.post("/login", async (req, res) => {
  try {
    if (!db) {
      return res
        .status(500)
        .json({ message: "Database is not configured on the server" });
    }

    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res
        .status(400)
        .json({ message: "Username/email dan password wajib diisi" });
    }

    const { rows } = await db.query(
      "SELECT id, email, username, password_hash, is_verified, role FROM users WHERE email = $1 OR username = $2",
      [identifier, identifier]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: "User tidak ditemukan" });
    }

    const user = rows[0];

    if (!user.is_verified) {
      return res.status(400).json({ message: "Email belum terverifikasi" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(400).json({ message: "Password salah" });
    }

    const token = generateToken(user);

    return res.json({
      message: "Login berhasil",
      token,
      role: user.role,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Login dengan Google
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login berhasil
 *       400:
 *         description: Token tidak valid
 */
authRouter.post("/google", async (req, res) => {
  try {
    if (!db) {
      return res
        .status(500)
        .json({ message: "Database is not configured on the server" });
    }

    if (!googleClient || !process.env.GOOGLE_CLIENT_ID) {
      return res
        .status(500)
        .json({ message: "Google login is not configured on the server" });
    }

    const body =
      req.body && typeof req.body === "object" ? req.body : {};
    const { idToken } = body;

    if (!idToken) {
      return res.status(400).json({ message: "Google ID token wajib diisi" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(400).json({ message: "Token Google tidak valid" });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const baseUsername = email.split("@")[0];
    const generatedUsername = `${baseUsername}_${Math.floor(
      1000 + Math.random() * 9000
    )}`;

    const { rows } = await db.query(
      "SELECT id, email, username, is_verified, role FROM users WHERE google_id = $1 OR email = $2",
      [googleId, email]
    );

    let user;

    if (rows.length > 0) {
      user = rows[0];
      if (!user.is_verified) {
        await db.query(
          "UPDATE users SET is_verified = true WHERE id = $1",
          [user.id]
        );
        user.is_verified = 1;
      }
    } else {
      const result = await db.query(
        "INSERT INTO users (email, username, password_hash, is_verified, verification_code, google_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
        [email, generatedUsername, "", true, null, googleId]
      );

      user = {
        id: result.rows[0].id,
        email,
        username: generatedUsername,
        role: "USER",
      };
    }

    const token = generateToken(user);

    return res.json({
      message: "Login Google berhasil",
      token,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Permintaan reset password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email reset password dikirim
 *       404:
 *         description: Email tidak terdaftar
 */
authRouter.post("/forgot-password", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }
    if (!mailTransporter) {
      return res.status(500).json({ message: "Email is not configured" });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email wajib diisi" });
    }

    const { rows } = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Email tidak terdaftar" });
    }

    const user = rows[0];
    const token = generateResetToken();
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await db.query(
      "UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3",
      [token, expires, user.id]
    );

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: "Reset Password",
      text: `Gunakan token berikut untuk reset password Anda: ${token}\n\nToken ini berlaku selama 1 jam.`,
    };

    await mailTransporter.sendMail(mailOptions);

    return res.json({ message: "Email reset password telah dikirim" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password dengan token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password berhasil diubah
 *       400:
 *         description: Token tidak valid
 */
authRouter.post("/reset-password", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token dan password baru wajib diisi" });
    }

    const { rows } = await db.query(
      "SELECT id FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()",
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: "Token tidak valid atau sudah kadaluarsa" });
    }

    const user = rows[0];
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await db.query(
      "UPDATE users SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2",
      [passwordHash, user.id]
    );

    return res.json({ message: "Password berhasil diubah" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout pengguna
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout berhasil
 */
authRouter.post("/logout", authenticate, async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const token = req.token;
    if (!token) {
        return res.status(400).json({ message: "Token not found" });
    }

    // Decode to get expiry
    const decoded = jwt.decode(token);
    let expiresAt = new Date();
    if (decoded && decoded.exp) {
        expiresAt = new Date(decoded.exp * 1000);
    } else {
        // Fallback default 1 day if no exp
        expiresAt.setDate(expiresAt.getDate() + 1);
    }

    await db.query(
      "INSERT INTO token_blacklist (token, expires_at) VALUES ($1, $2) ON CONFLICT (token) DO NOTHING",
      [token, expiresAt]
    );

    // Lazy Cleanup: Remove expired tokens to keep table size manageable
    // This runs asynchronously and doesn't block the response significantly
    db.query("DELETE FROM token_blacklist WHERE expires_at < NOW()").catch(err => console.error("Cleanup error:", err));

    return res.json({ message: "Logout berhasil" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = { authRouter };
