const express = require("express");
const { db } = require("../../config/db");
const { authenticate, requireAdmin } = require("../../middleware/auth");

const adminUsersRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: AdminUsers
 *   description: Manajemen pengguna (Admin)
 */

adminUsersRouter.use(authenticate, requireAdmin);

/**
 * @swagger
 * /admin/users:
 *   get:
 *     summary: Mendapatkan daftar semua pengguna
 *     tags: [AdminUsers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar pengguna
 */
adminUsersRouter.get("/", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const result = await db.query(
      `SELECT id, email, username, full_name, phone_number, role, is_verified, profile_picture, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );

    const users = result.rows.map(user => ({
      ...user,
      profile_picture_url: user.profile_picture 
        ? `${req.protocol}://${req.get("host")}/${user.profile_picture}` 
        : null
    }));

    return res.json(users);
  } catch (err) {
    console.error("Admin Users Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/users/{id}:
 *   get:
 *     summary: Mendapatkan detail pengguna
 *     tags: [AdminUsers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detail pengguna
 *       404:
 *         description: User tidak ditemukan
 */
adminUsersRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT id, email, username, full_name, phone_number, address, role, is_verified, profile_picture, created_at 
       FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    const user = result.rows[0];
    if (user.profile_picture) {
        user.profile_picture_url = `${req.protocol}://${req.get("host")}/${user.profile_picture}`;
    }

    return res.json(user);
  } catch (err) {
    console.error("Admin User Detail Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = { adminUsersRouter };
