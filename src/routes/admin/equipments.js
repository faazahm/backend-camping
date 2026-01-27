const express = require("express");
const { db } = require("../../config/db");
const { authenticate, requireAdmin } = require("../../middleware/auth");

const adminEquipmentsRouter = express.Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    return res.json(result.rows);
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
 *         application/json:
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
 *               photoUrl:
 *                 type: string
 *     responses:
 *       201:
 *         description: Peralatan berhasil ditambahkan
 *       400:
 *         description: Data tidak lengkap
 */
adminEquipmentsRouter.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    const { name, description, price, stock, photoUrl } = body;

    if (!name || price === undefined || stock === undefined) {
      return res.status(400).json({ message: "Nama, harga, dan stok wajib diisi" });
    }

    const result = await db.query(
      'INSERT INTO "equipments" (name, description, price, stock, photo_url, updated_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *',
      [name, description, price, stock, photoUrl]
    );
    return res.status(201).json(result.rows[0]);
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
 *         application/json:
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
 *               photoUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Peralatan berhasil diupdate
 *       404:
 *         description: Peralatan tidak ditemukan
 */
adminEquipmentsRouter.put("/:id", async (req, res) => {
  try {
    const publicId = req.params.id;
    const { name, description, price, stock, photoUrl } = req.body;
    
    if (!UUID_REGEX.test(publicId)) return res.status(400).json({ message: "Invalid UUID" });

    const check = await db.query('SELECT id FROM "equipments" WHERE public_id = $1', [publicId]);
    if (check.rows.length === 0) return res.status(404).json({ message: "Alat tidak ditemukan" });
    
    const id = check.rows[0].id;

    const result = await db.query(
      `UPDATE "equipments" 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description), 
           price = COALESCE($3, price), 
           stock = COALESCE($4, stock), 
           photo_url = COALESCE($5, photo_url),
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, description, price, stock, photoUrl, id]
    );
    return res.json(result.rows[0]);
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
