const express = require("express");
const { db } = require("../../config/db");
const { authenticate, requireAdmin } = require("../../middleware/auth");

const adminQuestionsRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: AdminQuestions
 *   description: Manajemen pertanyaan ulasan
 */

adminQuestionsRouter.use(authenticate, requireAdmin);

/**
 * @swagger
 * /admin/questions:
 *   get:
 *     summary: Mendapatkan semua pertanyaan ulasan
 *     tags: [AdminQuestions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar pertanyaan ulasan
 */
// GET / - List all questions (including inactive)
adminQuestionsRouter.get("/", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }
    const { rows } = await db.query("SELECT * FROM review_questions ORDER BY id ASC");
    
    // Format options to ensure they are arrays
    const formattedRows = rows.map(q => ({
      ...q,
      options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
    }));
    
    return res.json(formattedRows);
  } catch (err) {
    console.error("Admin Get Questions Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/questions:
 *   post:
 *     summary: Membuat pertanyaan ulasan baru
 *     tags: [AdminQuestions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - question
 *               - options
 *             properties:
 *               question:
 *                 type: string
 *               options:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Pertanyaan berhasil dibuat
 *       400:
 *         description: Data tidak lengkap
 */
// POST / - Create new question
adminQuestionsRouter.post("/", async (req, res) => {
  try {
    const { question, options } = req.body;
    if (!question || !options || !Array.isArray(options)) {
      return res.status(400).json({ message: "Question dan options (array) wajib diisi" });
    }

    const { rows } = await db.query(
      "INSERT INTO review_questions (question, options) VALUES ($1, $2) RETURNING *",
      [question, JSON.stringify(options)]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Admin Create Question Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/questions/{id}:
 *   put:
 *     summary: Update pertanyaan ulasan
 *     tags: [AdminQuestions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               question:
 *                 type: string
 *               options:
 *                 type: array
 *                 items:
 *                   type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Pertanyaan berhasil diupdate
 *       404:
 *         description: Pertanyaan tidak ditemukan
 */
// PUT /:id - Update question
adminQuestionsRouter.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { question, options, is_active } = req.body;

    // Build update query dynamically
    let updates = [];
    let values = [];
    let counter = 1;

    if (question) {
      updates.push(`question = $${counter}`);
      values.push(question);
      counter++;
    }
    if (options && Array.isArray(options)) {
      updates.push(`options = $${counter}`);
      values.push(JSON.stringify(options));
      counter++;
    }
    if (typeof is_active === "boolean") {
      updates.push(`is_active = $${counter}`);
      values.push(is_active);
      counter++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "Tidak ada data yang diupdate" });
    }

    values.push(id);
    const query = `UPDATE review_questions SET ${updates.join(", ")} WHERE id = $${counter} RETURNING *`;

    const { rows } = await db.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Pertanyaan tidak ditemukan" });
    }

    const updatedQuestion = rows[0];
    if (typeof updatedQuestion.options === 'string') {
        updatedQuestion.options = JSON.parse(updatedQuestion.options);
    }

    return res.json(updatedQuestion);
  } catch (err) {
    console.error("Admin Update Question Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/questions/{id}:
 *   delete:
 *     summary: Hapus pertanyaan ulasan
 *     tags: [AdminQuestions]
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
 *         description: Pertanyaan berhasil dihapus
 */
// DELETE /:id - Soft delete (deactivate) or Hard delete
// Recommended: Soft delete via PUT is_active=false, but here is hard delete if needed
adminQuestionsRouter.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.query("DELETE FROM review_questions WHERE id = $1", [id]);
    return res.json({ message: "Pertanyaan berhasil dihapus" });
  } catch (err) {
    console.error("Admin Delete Question Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = { adminQuestionsRouter };
