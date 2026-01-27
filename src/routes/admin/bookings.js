const express = require("express");
const { db } = require("../../config/db");
const { authenticate, requireAdmin } = require("../../middleware/auth");
const { getIO } = require("../../realtime/io");
const notificationService = require("../../services/notification");

const adminBookingsRouter = express.Router();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @swagger
 * tags:
 *   name: AdminBookings
 *   description: Manajemen booking (Admin)
 */

adminBookingsRouter.use(authenticate, requireAdmin);

/**
 * @swagger
 * /admin/bookings:
 *   get:
 *     summary: Mendapatkan semua booking
 *     tags: [AdminBookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar semua booking
 */
adminBookingsRouter.get("/", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const result = await db.query(
      `SELECT
        b.id,
        b.public_id,
        b.user_id,
        b.camp_id,
        b.start_date,
        b.end_date,
        b.people_count,
        b.total_price,
        b.status,
        b.created_at,
        u.username,
        u.email,
        c.name as camp_name
      FROM "bookings" b
      LEFT JOIN "users" u ON b.user_id = u.id
      LEFT JOIN "camps" c ON b.camp_id = c.id
      ORDER BY b.created_at DESC`
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("Admin Bookings Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/bookings/{id}/status:
 *   put:
 *     summary: Update status booking
 *     tags: [AdminBookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID Booking (UUID)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, PAID, CANCELLED, CHECK_IN, CHECKOUT]
 *     responses:
 *       200:
 *         description: Status berhasil diupdate
 *       400:
 *         description: Status tidak valid
 *       404:
 *         description: Booking tidak ditemukan
 */
adminBookingsRouter.put("/:id/status", async (req, res) => {
  let client = null;
  try {
    if (!db) return res.status(500).json({ message: "Database error" });

    const publicId = req.params.id;
    const { status } = req.body;

    if (!publicId || !status) return res.status(400).json({ message: "ID dan status wajib diisi" });
    if (!UUID_REGEX.test(publicId)) return res.status(400).json({ message: "Invalid UUID" });

    const allowed = ["PENDING", "PAID", "CANCELLED", "CHECK_IN", "CHECKOUT"];
    if (!allowed.includes(status)) return res.status(400).json({ message: "Status tidak valid" });

    client = await db.connect();
    await client.query("BEGIN");

    const currentResult = await client.query(
      'SELECT id, status, public_id FROM "bookings" WHERE public_id = $1 FOR UPDATE',
      [publicId]
    );

    if (currentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    const row = currentResult.rows[0];
    const bookingId = row.id;
    const previousStatus = row.status;

    const result = await client.query(
      'UPDATE "bookings" SET status = $1 WHERE id = $2 RETURNING id, public_id, user_id, camp_id, start_date, end_date, people_count, total_price, status',
      [status, bookingId]
    );

    const booking = result.rows[0];

    // Notification if status becomes PAID
    if (status === 'PAID' && previousStatus !== 'PAID') {
      await notificationService.createNotification(client, {
        message: `Booking #${booking.public_id.substring(0, 8)} telah dibayar (Status: PAID)`,
        type: 'BOOKING_PAID',
        relatedId: bookingId
      });
    }

    await client.query("COMMIT");

    const io = getIO();
    if (io) {
      io.emit("booking:statusUpdated", booking);
    }

    return res.json(booking);
  } catch (err) {
    if (client) {
        try { await client.query("ROLLBACK"); } catch (_) {}
    }
    console.error("Admin Booking Update Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (client) client.release();
  }
});

module.exports = { adminBookingsRouter };
