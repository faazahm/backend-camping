const express = require("express");
const { db } = require("../../config/db");
const { authenticate } = require("../../middleware/auth");

const dashboardRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard pengguna
 */

/**
 * @swagger
 * /dashboard/history:
 *   get:
 *     summary: Mendapatkan riwayat booking
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, CANCELLED, CHECK_IN, CHECKOUT]
 *         description: Filter berdasarkan status
 *     responses:
 *       200:
 *         description: Daftar riwayat booking
 */
dashboardRouter.get("/history", authenticate, async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const { status } = req.query;
    const userId = req.user.id;

    let query = `
      SELECT 
        b.public_id,
        b.start_date,
        b.end_date,
        b.people_count,
        b.total_price,
        b.status,
        b.created_at,
        c.name as camp_name,
        c.public_id as camp_public_id,
        (
          SELECT json_agg(json_build_object(
            'name', e.name,
            'quantity', be.quantity,
            'price', be.price,
            'nights', be.nights
          ))
          FROM booking_equipments be
          JOIN equipments e ON e.id = be.equipment_id
          WHERE be.booking_id = b.id
        ) as equipments
      FROM bookings b
      JOIN camps c ON c.id = b.camp_id
      WHERE b.user_id = $1
    `;

    const params = [userId];

    if (status) {
      const validStatuses = ['PENDING', 'PAID', 'CANCELLED', 'CHECK_IN', 'CHECKOUT'];
      if (validStatuses.includes(status.toUpperCase())) {
        query += ` AND b.status = $2`;
        params.push(status.toUpperCase());
      }
    }

    query += ` ORDER BY b.created_at DESC`;

    const { rows } = await db.query(query, params);

    return res.json(rows);
  } catch (err) {
    console.error("History Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = { dashboardRouter };
