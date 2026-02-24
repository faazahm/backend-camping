const express = require("express");
const { db } = require("../../config/db");
const { authenticate, requireAdmin } = require("../../middleware/auth");
const { uploadToSupabase } = require("../../utils/supabase");
const multer = require("multer");
const path = require("path");

const adminEquipmentsRouter = express.Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Konfigurasi Multer untuk Upload Foto Alat (Memory Storage untuk Supabase)
const storage = multer.memoryStorage();

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
 *   name: AdminEquipments
 *   description: Manajemen peralatan (Admin)
 */

adminEquipmentsRouter.use(authenticate, requireAdmin);

/**
 * @swagger
 * /admin/equipments:
 *   get:
 *     summary: Mendapatkan daftar semua peralatan
 *     tags: [AdminEquipments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar peralatan
 */
adminEquipmentsRouter.get("/", async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM "equipments" ORDER BY created_at ASC');
    
    // Tambahkan URL lengkap untuk photo_url
    const rows = result.rows.map(row => ({
      ...row,
      photo_url_full: row.photo_url ? (row.photo_url.startsWith('http') ? row.photo_url : `${req.protocol}://${req.get("host")}/${row.photo_url}`) : null
    }));
    
    return res.json(rows);
  } catch (err) {
    console.error("Admin Get Equipments Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/equipments:
 *   post:
 *     summary: Menambah peralatan baru
 *     tags: [AdminEquipments]
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
 *               - price
 *               - stock
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               stock:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Peralatan berhasil ditambahkan
 *       400:
 *         description: Data tidak lengkap
 */
adminEquipmentsRouter.post("/", upload.single("image"), async (req, res) => {
  try {
    const { name, description, price, stock } = req.body;
    let photoUrl = null;

    // Konversi ke Integer murni untuk menghindari pembulatan atau manipulasi otomatis
    const priceInt = parseInt(price, 10);
    const stockInt = parseInt(stock, 10);

    if (!name || isNaN(priceInt) || isNaN(stockInt)) {
      return res.status(400).json({ message: "Nama, harga, dan stok wajib diisi dengan angka valid" });
    }

    // Jika ada file gambar, upload ke Supabase
    if (req.file) {
      try {
        photoUrl = await uploadToSupabase(req.file, "equipments", "equipment-images");
      } catch (uploadError) {
        return res.status(500).json({ message: "Gagal upload gambar ke Supabase" });
      }
    }

    const result = await db.query(
      'INSERT INTO "equipments" (name, description, price, stock, photo_url, updated_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
      [name, description, priceInt, stockInt, photoUrl]
    );
    
    const row = result.rows[0];
    return res.status(201).json({
      ...row,
      photo_url_full: row.photo_url ? (row.photo_url.startsWith('http') ? row.photo_url : `${req.protocol}://${req.get("host")}/${row.photo_url}`) : null
    });
  } catch (err) {
    console.error("Admin Create Equipment Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/equipments/{id}:
 *   put:
 *     summary: Update peralatan
 *     tags: [AdminEquipments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID Peralatan (UUID)
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               stock:
 *                 type: integer
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Peralatan berhasil diupdate
 *       404:
 *         description: Peralatan tidak ditemukan
 */
adminEquipmentsRouter.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const publicId = req.params.id;
    const { name, description, price, stock } = req.body;
    
    if (!UUID_REGEX.test(publicId)) {
      return res.status(400).json({ message: "Invalid UUID" });
    }

    const check = await db.query('SELECT id, photo_url FROM "equipments" WHERE public_id = $1', [publicId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Alat tidak ditemukan" });
    }
    
    const id = check.rows[0].id;
    let photoUrl = check.rows[0].photo_url;

    // Jika ada upload gambar baru ke Supabase
    if (req.file) {
      try {
        photoUrl = await uploadToSupabase(req.file, "equipments", "equipment-images");
      } catch (uploadError) {
        return res.status(500).json({ message: "Gagal upload gambar ke Supabase" });
      }
    }

    const priceInt = price !== undefined ? parseInt(price, 10) : undefined;
    const stockInt = stock !== undefined ? parseInt(stock, 10) : undefined;

    const result = await db.query(
      `UPDATE "equipments"
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           stock = COALESCE($4, stock),
           photo_url = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        name || null, 
        description || null, 
        !isNaN(priceInt) ? priceInt : null, 
        !isNaN(stockInt) ? stockInt : null, 
        photoUrl, 
        id
      ]
    );

    const row = result.rows[0];
    return res.json({
      ...row,
      photo_url_full: row.photo_url ? (row.photo_url.startsWith('http') ? row.photo_url : `${req.protocol}://${req.get("host")}/${row.photo_url}`) : null
    });
  } catch (err) {
    console.error("Admin Update Equipment Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});


/**
 * @swagger
 * /admin/equipments/{id}:
 *   delete:
 *     summary: Hapus peralatan
 *     tags: [AdminEquipments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID Peralatan (UUID)
 *     responses:
 *       200:
 *         description: Peralatan berhasil dihapus
 *       400:
 *         description: Tidak dapat menghapus karena sedang disewa
 *       404:
 *         description: Peralatan tidak ditemukan
 */
adminEquipmentsRouter.delete("/:id", async (req, res) => {
  try {
    const publicId = req.params.id;

    if (!UUID_REGEX.test(publicId)) return res.status(400).json({ message: "Invalid UUID" });

    const check = await db.query('SELECT id FROM "equipments" WHERE public_id = $1', [publicId]);
    if (check.rows.length === 0) return res.status(404).json({ message: "Alat tidak ditemukan" });
    
    const id = check.rows[0].id;
    await db.query('DELETE FROM "equipments" WHERE id = $1', [id]);
    
    return res.json({ message: "Alat berhasil dihapus" });
  } catch (err) {
    console.error("Admin Delete Equipment Error:", err);
    if (err.code === '23503') {
        return res.status(400).json({ message: "Tidak dapat menghapus alat yang sedang disewa" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = { adminEquipmentsRouter };
