const express = require("express");
const { authenticate, requireAdmin } = require("../../middleware/auth");
const notificationService = require("../../services/notification");

const notificationRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: AdminNotifications
 *   description: Notifikasi sistem untuk admin
 */

// Middleware: Hanya admin yang bisa akses notifikasi sistem
notificationRouter.use(authenticate, requireAdmin);

/**
 * @swagger
 * /admin/notifications:
 *   get:
 *     summary: Mendapatkan daftar notifikasi sistem
 *     tags: [AdminNotifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar notifikasi dan jumlah belum dibaca
 */
// GET /notifications - Ambil daftar notifikasi + jumlah unread
notificationRouter.get("/", async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      notificationService.getNotifications(20),
      notificationService.getUnreadCount()
    ]);

    return res.json({
      notifications,
      unreadCount
    });
  } catch (err) {
    console.error("Get Notifications Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/notifications/{id}/read:
 *   put:
 *     summary: Menandai notifikasi sebagai sudah dibaca
 *     tags: [AdminNotifications]
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
 *         description: Notifikasi ditandai sudah dibaca
 */
// PUT /notifications/:id/read - Tandai notifikasi sbg sudah dibaca
notificationRouter.put("/:id/read", async (req, res) => {
  try {
    const { id } = req.params;
    await notificationService.markAsRead(id);
    return res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error("Mark Notification Read Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = { notificationRouter };
