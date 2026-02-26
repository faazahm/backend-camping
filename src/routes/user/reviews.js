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
 * /reviews/questions:
 *   get:
 *     summary: Mendapatkan 10 pertanyaan review aktif
 *     tags: [Reviews]
 *     responses:
 *       200:
 *         description: Daftar 10 pertanyaan
 */
reviewsRouter.get("/questions", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ message: "Database is not configured" });

    const { rows } = await db.query(
      "SELECT id, question, options FROM review_questions ORDER BY id ASC LIMIT 10"
    );

    const formattedQuestions = rows.map(q => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
    }));

    return res.json(formattedQuestions);
  } catch (err) {
    console.error("Get Questions Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /reviews/history:
 *   get:
 *     summary: Mendapatkan riwayat review user login
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar riwayat ulasan
 */
reviewsRouter.get("/history", async (req, res) => {
  try {
    if (!db) return res.status(500).json({ message: "Database is not configured" });

    const userId = req.user.id;
    const query = `
      SELECT 
        r.id,
        r.total_score,
        r.comment,
        r.created_at,
        c.name as camp_name
      FROM reviews r
      JOIN bookings b ON r.booking_id = b.id
      JOIN camps c ON b.camp_id = c.id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
    `;

    const { rows } = await db.query(query, [userId]);
    return res.json(rows);
  } catch (err) {
    console.error("Get Review History Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /reviews/summary:
 *   get:
 *     summary: Mendapatkan ringkasan review global (user-side)
 *     tags: [Reviews]
 *     responses:
 *       200:
 *         description: Ringkasan rating
 */
reviewsRouter.get("/summary", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const query = `
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as average_rating
      FROM reviews
    `;

    const { rows } = await db.query(query);
    
    return res.json({
      totalReviews: parseInt(rows[0].total_reviews),
      averageRating: parseFloat(parseFloat(rows[0].average_rating || 0).toFixed(1))
    });
  } catch (err) {
    console.error("Get Reviews Summary Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

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

    return res.json(rows);
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
    const { booking_id: bookingPublicId, answers, comment } = req.body;

    // 1. Validasi Input Dasar
    if (!bookingPublicId || !answers || !Array.isArray(answers) || answers.length !== 10) {
      return res.status(400).json({ message: "Semua 10 pertanyaan wajib diisi" });
    }

    if (!comment || comment.length < 10) {
      return res.status(400).json({ message: "Komentar minimal 10 karakter" });
    }

    // 2. Validasi Booking (Milik user, status CHECK_OUT)
    const bookingCheck = await db.query(
      "SELECT id, camp_id FROM bookings WHERE public_id = $1 AND user_id = $2 AND status = 'CHECK_OUT'",
      [bookingPublicId, userId]
    );

    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ message: "Booking tidak ditemukan atau status belum checkout" });
    }

    const internalBookingId = bookingCheck.rows[0].id;
    const campId = bookingCheck.rows[0].camp_id;

    // 3. Cek Duplikasi Review
    const reviewCheck = await db.query(
      "SELECT id FROM reviews WHERE booking_id = $1",
      [internalBookingId]
    );

    if (reviewCheck.rows.length > 0) {
      return res.status(400).json({ message: "Anda sudah memberikan review untuk booking ini" });
    }

    // 4. Hitung Nilai Per Aspek & Total Score
    // Ambil semua pertanyaan aktif untuk memetakan jawaban ke aspek
    const qResult = await db.query("SELECT id, aspect FROM review_questions WHERE is_active = true");
    const questions = qResult.rows;

    if (questions.length === 0) {
      return res.status(500).json({ message: "Konfigurasi pertanyaan review tidak ditemukan" });
    }

    // Map untuk menyimpan skor per aspek
    const aspectScores = {
      kebersihan: { sum: 0, count: 0 },
      fasilitas: { sum: 0, count: 0 },
      pelayanan: { sum: 0, count: 0 },
      keamanan: { sum: 0, count: 0 },
      kepuasan: { sum: 0, count: 0 }
    };

    // Map jawaban user berdasarkan question_id
    const answerMap = {};
    for (const a of answers) {
      if (typeof a.score !== 'number' || a.score < 1 || a.score > 5) {
        return res.status(400).json({ message: "Score harus berupa angka antara 1-5" });
      }
      answerMap[a.question_id] = a.score;
    }

    // Iterasi pertanyaan dari DB dan cocokkan dengan jawaban user
    for (const q of questions) {
      const score = answerMap[q.id];
      if (score === undefined) {
        return res.status(400).json({ message: `Pertanyaan "${q.question || q.id}" belum dijawab` });
      }

      const aspectKey = (q.aspect || "kepuasan").toLowerCase();
      if (aspectScores[aspectKey]) {
        aspectScores[aspectKey].sum += score;
        aspectScores[aspectKey].count += 1;
      } else {
        // Fallback jika ada aspek lain yang tidak terdaftar di bobot
        aspectScores.kepuasan.sum += score;
        aspectScores.kepuasan.count += 1;
      }
    }

    // Hitung rata-rata per aspek (jika count 0, beri default 0 atau 3)
    const getAvg = (key) => aspectScores[key].count > 0 ? aspectScores[key].sum / aspectScores[key].count : 0;

    const avgKebersihan = getAvg('kebersihan');
    const avgFasilitas = getAvg('fasilitas');
    const avgPelayanan = getAvg('pelayanan');
    const avgKeamanan = getAvg('keamanan');
    const avgKepuasan = getAvg('kepuasan');

    // Rumus Bobot: Kebersihan 30%, Fasilitas 25%, Pelayanan 20%, Keamanan 15%, Kepuasan 10%
    const totalScore = (
      (avgKebersihan / 5 * 30) +
      (avgFasilitas / 5 * 25) +
      (avgPelayanan / 5 * 20) +
      (avgKeamanan / 5 * 15) +
      (avgKepuasan / 5 * 10)
    );

    // 5. Simpan ke Database
    await db.query(
      `INSERT INTO reviews (booking_id, user_id, camp_id, evaluation_answers, total_score, comment, rating)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        internalBookingId, 
        userId, 
        campId, 
        JSON.stringify(answers), 
        Math.round(totalScore), 
        comment,
        Math.round((avgKebersihan + avgFasilitas + avgPelayanan + avgKeamanan + avgKepuasan) / 5)
      ]
    );

    return res.status(201).json({ 
      message: "Review berhasil dikirim",
      total_score: Math.round(totalScore)
    });
  } catch (err) {
    console.error("Submit Review Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = { reviewsRouter };
