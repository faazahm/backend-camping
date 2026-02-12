const express = require("express");
const { db } = require("../../config/db");
const { authenticate } = require("../../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const profileRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Profile
 *   description: Manajemen profil pengguna
 */

// Konfigurasi Multer untuk Upload Foto
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads/profiles";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "profile-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error("Hanya file gambar yang diperbolehkan!"));
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Maksimal 5MB (sebelumnya 2MB)
  fileFilter: fileFilter
});

/**
 * @swagger
 * /profile:
 *   get:
 *     summary: Mendapatkan profil pengguna
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data profil pengguna
 *       404:
 *         description: User tidak ditemukan
 */
// GET Profile (Ambil data profile user)
profileRouter.get("/", authenticate, async (req, res) => {
  console.log(`[Profile] GET request received for user: ${req.user.id}`);
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const userId = req.user.id;
    const { rows } = await db.query(
      `SELECT id, email, username, full_name, phone_number, address, profile_picture, role, is_verified 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    const user = rows[0];
    
    // Tambahkan URL lengkap untuk foto profile jika ada
    if (user.profile_picture) {
      user.profile_picture_url = `${req.protocol}://${req.get("host")}/${user.profile_picture}`;
    }

    return res.json(user);
  } catch (err) {
    console.error("Get Profile Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /profile:
 *   put:
 *     summary: Update profil pengguna (termasuk foto)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               phone_number:
 *                 type: string
 *               address:
 *                 type: string
 *               profile_picture:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profil berhasil diperbarui
 *       400:
 *         description: File terlalu besar atau format salah
 */
// PUT & POST Profile (Update data profile + upload foto)
const updateProfileHandler = async (req, res) => {
  console.log(`[Profile] ${req.method} request received`);
  console.log("[Profile] Body:", req.body);
  console.log("[Profile] File:", req.file ? req.file.filename : "No file uploaded");

  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const userId = req.user.id;
    const { full_name, phone_number, address } = req.body;
    
    // Ambil data user lama
    const currentUser = await db.query("SELECT profile_picture FROM users WHERE id = $1", [userId]);
    let profilePicturePath = currentUser.rows[0]?.profile_picture;

    // Jika ada file baru yang diupload
    if (req.file) {
      // Hapus foto lama jika ada dan bukan default
      if (profilePicturePath && fs.existsSync(profilePicturePath)) {
        try {
          fs.unlinkSync(profilePicturePath);
        } catch (e) {
          console.error("Gagal menghapus foto lama:", e);
        }
      }
      // Simpan path baru dengan normalisasi slash
      profilePicturePath = req.file.path.replace(/\\/g, "/");
    }

    // Gunakan COALESCE agar jika field tidak dikirim, data lama tetap terjaga
    // Namun khusus untuk profilePicturePath, kita masukkan nilai yang sudah kita proses di atas
    const result = await db.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           phone_number = COALESCE($2, phone_number),
           address = COALESCE($3, address),
           profile_picture = $4
       WHERE id = $5
       RETURNING id, email, username, full_name, phone_number, address, profile_picture, role`,
      [
        full_name || null, 
        phone_number || null, 
        address || null, 
        profilePicturePath || null, 
        userId
      ]
    );

    const updatedUser = result.rows[0];
    
    if (updatedUser && updatedUser.profile_picture) {
      updatedUser.profile_picture_url = `${req.protocol}://${req.get("host")}/${updatedUser.profile_picture}`;
    }

    return res.json({
      message: "Profile berhasil diperbarui",
      user: updatedUser
    });

  } catch (err) {
    console.error("Update Profile Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const uploadMiddleware = (req, res, next) => {
  upload.single("profile_picture")(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "Ukuran file terlalu besar (Maks 5MB)" });
      }
      return res.status(400).json({ message: err.message });
    } else if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

// Menangani /profile dan /profile/
profileRouter.route("/")
  .put(authenticate, uploadMiddleware, updateProfileHandler)
  .post(authenticate, uploadMiddleware, updateProfileHandler)
  .patch(authenticate, uploadMiddleware, updateProfileHandler);

// Tambahkan alias /update jika frontend memanggilnya
profileRouter.post("/update", authenticate, uploadMiddleware, updateProfileHandler);
profileRouter.put("/update", authenticate, uploadMiddleware, updateProfileHandler);



module.exports = { profileRouter };
