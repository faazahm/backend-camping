const express = require("express");
const { db } = require("../../config/db");
const { authenticate, requireAdmin } = require("../../middleware/auth");

const adminCampsRouter = express.Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      `SELECT id, public_id, name, description, location, nightly_price, daily_capacity, is_active, created_at, updated_at
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
 *         application/json:
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
 *     responses:
 *       201:
 *         description: Camp berhasil ditambahkan
 *       400:
 *         description: Data tidak lengkap
 */
adminCampsRouter.post("/", async (req, res) => {
  try {
    const { name, description, location, dailyCapacity, nightlyPrice } = req.body;

    if (!name || dailyCapacity === undefined || nightlyPrice === undefined) {
      return res.status(400).json({ message: "Nama, kapasitas harian, dan harga per malam wajib diisi" });
    }

    const result = await db.query(
      `INSERT INTO "camps" (name, description, location, daily_capacity, nightly_price, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW())
       RETURNING *`,
      [name, description, location, dailyCapacity, nightlyPrice]
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
 *         application/json:
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
 *     responses:
 *       200:
 *         description: Camp berhasil diupdate
 *       404:
 *         description: Camp tidak ditemukan
 */
adminCampsRouter.put("/:id", async (req, res) => {
  try {
    const publicId = req.params.id;
    const { name, description, location, dailyCapacity, nightlyPrice, isActive } = req.body;

    if (!UUID_REGEX.test(publicId)) {
      return res.status(400).json({ message: "ID camp tidak valid" });
    }

    // Check existence
    const check = await db.query('SELECT id FROM "camps" WHERE public_id = $1', [publicId]);
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Camp tidak ditemukan" });
    }
    const id = check.rows[0].id;

    const result = await db.query(
      `UPDATE "camps"
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           location = COALESCE($3, location),
           daily_capacity = COALESCE($4, daily_capacity),
           nightly_price = COALESCE($5, nightly_price),
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [name, description, location, dailyCapacity, nightlyPrice, isActive, id]
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
