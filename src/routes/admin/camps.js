const express = require("express");
const { db } = require("../../config/db");
const { authenticate, requireAdmin } = require("../../middleware/auth");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const adminCampsRouter = express.Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Konfigurasi Multer untuk Upload Gambar Camp
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "uploads/camps";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "camp-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
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
  limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB
  fileFilter: fileFilter
});

/**
 * @swagger
 * tags:
 *   name: AdminCamps
 *   description: Manajemen lokasi camp (Admin)
 */

adminCampsRouter.use(authenticate, requireAdmin);

/**
 * @swagger
 * /admin/camps:
 *   get:
 *     summary: Mendapatkan daftar semua camp
 *     tags: [AdminCamps]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar camp lengkap
 */
adminCampsRouter.get("/", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const result = await db.query(
      `SELECT id, public_id, name, description, location, nightly_price, daily_capacity, is_active, image, created_at, updated_at
       FROM "camps"
       ORDER BY created_at ASC`
    );

    return res.json(
      result.rows.map((row) => ({
        id: row.public_id,
        name: row.name,
        description: row.description,
        location: row.location,
        nightlyPrice: row.nightly_price,
        dailyCapacity: row.daily_capacity,
        isActive: row.is_active,
        image: row.image,
        image_url: row.image ? `${req.protocol}://${req.get("host")}/${row.image}` : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
    );
  } catch (err) {
    console.error("Admin Get Camps Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/camps:
 *   post:
 *     summary: Menambah lokasi camp baru
 *     tags: [AdminCamps]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - dailyCapacity
 *               - nightlyPrice
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               location:
 *                 type: string
 *               dailyCapacity:
 *                 type: integer
 *               nightlyPrice:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Camp berhasil ditambahkan
 *       400:
 *         description: Data tidak lengkap
 */
adminCampsRouter.post("/", upload.single("image"), async (req, res) => {
  try {
    const { name, description, location, dailyCapacity, nightlyPrice } = req.body;
    const imagePath = req.file ? req.file.path.replace(/\\/g, "/") : null;

    if (!name || dailyCapacity === undefined || nightlyPrice === undefined) {
      // Jika gagal, hapus file yang sudah terlanjur diupload
      if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
      return res.status(400).json({ message: "Nama, kapasitas harian, dan harga per malam wajib diisi" });
    }

    const result = await db.query(
      `INSERT INTO "camps" (name, description, location, daily_capacity, nightly_price, image, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
       RETURNING *`,
      [name, description, location, dailyCapacity, nightlyPrice, imagePath]
    );

    const row = result.rows[0];
    return res.status(201).json({
        id: row.public_id,
        name: row.name,
        description: row.description,
        location: row.location,
        nightlyPrice: row.nightly_price,
        dailyCapacity: row.daily_capacity,
        isActive: row.is_active,
        image: row.image,
        image_url: row.image ? `${req.protocol}://${req.get("host")}/${row.image}` : null,
        createdAt: row.created_at
    });
  } catch (err) {
    console.error("Admin Create Camp Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/camps/{id}:
 *   put:
 *     summary: Update informasi camp
 *     tags: [AdminCamps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID Camp (UUID)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               location:
 *                 type: string
 *               dailyCapacity:
 *                 type: integer
 *               nightlyPrice:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Camp berhasil diupdate
 *       404:
 *         description: Camp tidak ditemukan
 */
adminCampsRouter.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const publicId = req.params.id;
    const { name, description, location, dailyCapacity, nightlyPrice, isActive } = req.body;

    if (!UUID_REGEX.test(publicId)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "ID camp tidak valid" });
    }

    // Check existence and get current image
    const check = await db.query('SELECT id, image FROM "camps" WHERE public_id = $1', [publicId]);
    if (check.rows.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "Camp tidak ditemukan" });
    }
    
    const id = check.rows[0].id;
    let imagePath = check.rows[0].image;

    // Jika ada upload gambar baru
    if (req.file) {
      // Hapus gambar lama jika ada
      if (imagePath && fs.existsSync(imagePath)) {
        try { fs.unlinkSync(imagePath); } catch (e) {}
      }
      imagePath = req.file.path.replace(/\\/g, "/");
    }

    const result = await db.query(
      `UPDATE "camps"
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           location = COALESCE($3, location),
           daily_capacity = COALESCE($4, daily_capacity),
           nightly_price = COALESCE($5, nightly_price),
           is_active = COALESCE($6, is_active),
           image = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        name || null, 
        description || null, 
        location || null, 
        dailyCapacity || null, 
        nightlyPrice || null, 
        isActive !== undefined ? isActive : null, 
        imagePath, 
        id
      ]
    );

    const row = result.rows[0];
    return res.json({
        id: row.public_id,
        name: row.name,
        description: row.description,
        location: row.location,
        nightlyPrice: row.nightly_price,
        dailyCapacity: row.daily_capacity,
        isActive: row.is_active,
        image: row.image,
        image_url: row.image ? `${req.protocol}://${req.get("host")}/${row.image}` : null,
        updatedAt: row.updated_at
    });
  } catch (err) {
    console.error("Admin Update Camp Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});


/**
 * @swagger
 * /admin/camps/{id}:
 *   delete:
 *     summary: Hapus camp (Soft Delete)
 *     tags: [AdminCamps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Camp dinonaktifkan
 */
adminCampsRouter.delete("/:id", async (req, res) => {
    try {
        const publicId = req.params.id;
        if (!UUID_REGEX.test(publicId)) return res.status(400).json({ message: "Invalid ID" });

        const result = await db.query(
            'UPDATE "camps" SET is_active = false, updated_at = NOW() WHERE public_id = $1 RETURNING id',
            [publicId]
        );

        if (result.rows.length === 0) return res.status(404).json({ message: "Camp tidak ditemukan" });

        return res.json({ message: "Camp berhasil dinonaktifkan (Soft Delete)" });
    } catch (err) {
        console.error("Admin Delete Camp Error:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = { adminCampsRouter };
