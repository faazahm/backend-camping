const express = require("express");
const { db } = require("../../config/db");
const { authenticate } = require("../../middleware/auth");

const reviewsRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Manajemen ulasan pengguna
 */

reviewsRouter.use(authenticate);

/**
 * @swagger
 * /reviews/pending:
 *   get:
 *     summary: Mendapatkan daftar review yang pending
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar review pending dan pertanyaan evaluasi
 */
// GET /pending - Cek apakah ada booking yang perlu direview
reviewsRouter.get("/pending", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const userId = req.user.id;

    // Ambil pertanyaan aktif dari database
    const questionsQuery = await db.query(
      "SELECT id, question, options FROM review_questions WHERE is_active = true ORDER BY id ASC"
    );

    // Format questions to ensure options is an array
    const questions = questionsQuery.rows.map(q => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
    }));

    // Cari booking dengan status CHECK_OUT yang belum ada di tabel reviews
    const query = `
      SELECT b.id, b.public_id, b.start_date, b.end_date, c.name as camp_name
      FROM bookings b
      JOIN camps c ON b.camp_id = c.id
      WHERE b.user_id = $1 
      AND b.status = 'CHECK_OUT'
      AND NOT EXISTS (
        SELECT 1 FROM reviews r WHERE r.booking_id = b.id
      )
      ORDER BY b.end_date DESC
    `;

    const { rows } = await db.query(query, [userId]);

    return res.json({
      pendingReviews: rows,
      questions: questionsQuery.rows,
    });
  } catch (err) {
    console.error("Get Pending Reviews Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /reviews:
 *   post:
 *     summary: Mengirim ulasan baru
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *               - rating
 *               - answers
 *             properties:
 *               bookingId:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               answers:
 *                 type: object
 *     responses:
 *       201:
 *         description: Review berhasil dikirim
 *       400:
 *         description: Data tidak valid atau sudah direview
 *       404:
 *         description: Booking tidak ditemukan
 */
// POST / - Submit review
reviewsRouter.post("/", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const userId = req.user.id;
    const { bookingId, rating, answers } = req.body;

    if (!bookingId || !rating || !answers) {
      return res.status(400).json({ message: "Data tidak lengkap" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating harus antara 1-5" });
    }

    // Validasi booking
    const bookingCheck = await db.query(
      "SELECT id FROM bookings WHERE public_id = $1 AND user_id = $2 AND status = 'CHECK_OUT'",
      [bookingId, userId]
    );

    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ message: "Booking tidak ditemukan atau status belum checkout" });
    }

    const internalBookingId = bookingCheck.rows[0].id;

    // Cek duplikasi review
    const reviewCheck = await db.query(
      "SELECT id FROM reviews WHERE booking_id = $1",
      [internalBookingId]
    );

    if (reviewCheck.rows.length > 0) {
      return res.status(400).json({ message: "Anda sudah memberikan review untuk booking ini" });
    }

    // Insert review
    await db.query(
      `INSERT INTO reviews (booking_id, user_id, rating, evaluation_answers)
       VALUES ($1, $2, $3, $4)`,
      [internalBookingId, userId, rating, JSON.stringify(answers)]
    );

    return res.status(201).json({ message: "Review berhasil dikirim" });
  } catch (err) {
    console.error("Submit Review Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = { reviewsRouter };
