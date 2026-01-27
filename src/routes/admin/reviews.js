const express = require("express");
const { db } = require("../../config/db");
const { authenticate, requireAdmin } = require("../../middleware/auth");

const adminReviewsRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: AdminReviews
 *   description: Manajemen ulasan pengguna
 */

adminReviewsRouter.use(authenticate, requireAdmin);

/**
 * @swagger
 * /admin/reviews/summary:
 *   get:
 *     summary: Mendapatkan ringkasan statistik ulasan
 *     tags: [AdminReviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistik ulasan
 */
// GET /summary - Get reviews statistics
adminReviewsRouter.get("/summary", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    // 1. Get raw reviews data for aggregation
    const reviewsQuery = `SELECT rating, evaluation_answers FROM reviews`;
    const { rows: reviews } = await db.query(reviewsQuery);

    // 2. Get questions map for labeling
    const questionsQuery = `SELECT id, question FROM review_questions`;
    const { rows: questions } = await db.query(questionsQuery);
    
    // Map question ID to text
    const questionMap = {};
    questions.forEach(q => {
      questionMap[q.id] = q.question;
    });

    // 3. Process Data
    const totalReviews = reviews.length;
    let totalRating = 0;
    const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const evaluationStats = {}; // { questionId: { questionText, answers: { "OptionA": count } } }

    reviews.forEach(review => {
      // Rating Stats
      totalRating += review.rating;
      if (ratingDistribution[review.rating] !== undefined) {
        ratingDistribution[review.rating]++;
      }

      // Evaluation Stats
      let answers = review.evaluation_answers;
      if (typeof answers === "string") {
        try {
          answers = JSON.parse(answers);
        } catch (e) {
          answers = {};
        }
      }

      // Iterate answers (Assuming answers is object { "1": "Answer A", "2": "Answer B" } or Array)
      // Frontend likely sends object map or array. Let's handle both or assume standard.
      // Based on typical form handlers, let's assume it matches the structure sent by FE.
      // If it's an array: [{ questionId: 1, answer: "A" }]
      // If it's an object: { "1": "A" }
      
      // Let's normalize iteration
      const answerEntries = Array.isArray(answers) 
        ? answers.map(a => [a.questionId, a.answer]) 
        : Object.entries(answers || {});

      answerEntries.forEach(([qId, ansVal]) => {
        if (!evaluationStats[qId]) {
          evaluationStats[qId] = {
            question: questionMap[qId] || `Question #${qId}`,
            counts: {}
          };
        }
        if (ansVal) {
           evaluationStats[qId].counts[ansVal] = (evaluationStats[qId].counts[ansVal] || 0) + 1;
        }
      });
    });

    const averageRating = totalReviews > 0 ? (totalRating / totalReviews).toFixed(1) : 0;

    return res.json({
      totalReviews,
      averageRating: parseFloat(averageRating),
      ratingDistribution,
      evaluationStats
    });

  } catch (err) {
    console.error("Admin Get Reviews Summary Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/reviews:
 *   get:
 *     summary: Mendapatkan daftar semua ulasan
 *     tags: [AdminReviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar semua ulasan pengguna
 */
// GET / - List all reviews
adminReviewsRouter.get("/", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const query = `
      SELECT 
        r.id,
        r.rating,
        r.evaluation_answers,
        r.created_at,
        u.full_name as user_name,
        u.email as user_email,
        c.name as camp_name,
        b.public_id as booking_id,
        b.start_date,
        b.end_date
      FROM reviews r
      JOIN bookings b ON r.booking_id = b.id
      JOIN users u ON r.user_id = u.id
      JOIN camps c ON b.camp_id = c.id
      ORDER BY r.created_at DESC
    `;

    const { rows } = await db.query(query);

    // Parse evaluation_answers if it is a string
    const formattedRows = rows.map((row) => ({
      ...row,
      evaluation_answers: typeof row.evaluation_answers === "string" 
        ? JSON.parse(row.evaluation_answers) 
        : row.evaluation_answers,
    }));

    return res.json(formattedRows);
  } catch (err) {
    console.error("Admin Get Reviews Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = { adminReviewsRouter };
