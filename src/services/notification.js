const { db } = require("../config/db");

/**
 * Membuat notifikasi baru
 * @param {Object} client - Database client untuk transaksi (opsional, bisa null jika tidak dalam transaksi)
 * @param {Object} data - Data notifikasi
 * @param {string} data.message - Pesan notifikasi
 * @param {string} data.type - Tipe notifikasi (e.g. BOOKING_PAID, BOOKING_CREATED)
 * @param {number} data.relatedId - ID terkait (e.g. ID Booking)
 */
async function createNotification(client, { message, type, relatedId }) {
  const query = `
    INSERT INTO notifications (message, type, related_id, created_at) 
    VALUES ($1, $2, $3, NOW())
    RETURNING *
  `;
  const values = [message, type, relatedId];

  if (client) {
    return await client.query(query, values);
  } else {
    return await db.query(query, values);
  }
}

/**
 * Mengambil daftar notifikasi terbaru
 * @param {number} limit - Jumlah notifikasi yang diambil
 */
async function getNotifications(limit = 20) {
  const query = `
    SELECT * FROM notifications 
    ORDER BY created_at DESC 
    LIMIT $1
  `;
  const result = await db.query(query, [limit]);
  return result.rows;
}

/**
 * Menghitung jumlah notifikasi yang belum dibaca
 */
async function getUnreadCount() {
  const query = `SELECT COUNT(*) as count FROM notifications WHERE is_read = false`;
  const result = await db.query(query);
  return parseInt(result.rows[0].count);
}

/**
 * Menandai notifikasi sebagai sudah dibaca
 * @param {number} id - ID notifikasi
 */
async function markAsRead(id) {
  const query = `UPDATE notifications SET is_read = true WHERE id = $1`;
  await db.query(query, [id]);
}

module.exports = {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
};
