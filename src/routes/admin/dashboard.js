const express = require("express");
const { db } = require("../../config/db");
const { authenticate, requireAdmin } = require("../../middleware/auth");

const adminDashboardRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: AdminDashboard
 *   description: Dashboard admin dan statistik
 */

adminDashboardRouter.use(authenticate, requireAdmin);

/**
 * @swagger
 * /admin/dashboard/stats:
 *   get:
 *     summary: Mendapatkan statistik dashboard admin
 *     tags: [AdminDashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data statistik (booking, pendapatan, dll)
 */
adminDashboardRouter.get("/stats", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    // Parallel queries for efficiency
    const [bookingStats, revenueStats, activeCamps, lowStockEquipments] = await Promise.all([
      // Count total bookings and breakdown by status
      db.query(`
        SELECT 
          COUNT(*) as total_bookings,
          COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
          COUNT(*) FILTER (WHERE status = 'PAID') as paid,
          COUNT(*) FILTER (WHERE status = 'CHECK_IN') as check_in,
          COUNT(*) FILTER (WHERE status = 'CHECK_OUT') as completed,
          COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled
        FROM bookings
      `),
      
      // Calculate total revenue (only PAID, CHECK_IN, CHECK_OUT)
      db.query(`
        SELECT COALESCE(SUM(total_price), 0) as total_revenue
        FROM bookings
        WHERE status IN ('PAID', 'CHECK_IN', 'CHECK_OUT')
      `),

      // Count active camps
      db.query(`
        SELECT COUNT(*) as active_camps FROM camps WHERE is_active = true
      `),

      // Get equipments with low stock (arbitrary threshold < 5) - informative for dashboard
      db.query(`
        SELECT name, stock FROM equipments WHERE stock < 5 ORDER BY stock ASC LIMIT 5
      `)
    ]);

    const stats = {
      bookings: {
        total: parseInt(bookingStats.rows[0].total_bookings),
        pending: parseInt(bookingStats.rows[0].pending),
        paid: parseInt(bookingStats.rows[0].paid),
        active: parseInt(bookingStats.rows[0].check_in),
        completed: parseInt(bookingStats.rows[0].completed),
        cancelled: parseInt(bookingStats.rows[0].cancelled),
      },
      revenue: parseInt(revenueStats.rows[0].total_revenue),
      activeCamps: parseInt(activeCamps.rows[0].active_camps),
      lowStockEquipments: lowStockEquipments.rows
    };

    return res.json(stats);
  } catch (err) {
    console.error("Admin Dashboard Stats Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /admin/dashboard/stats/monthly-revenue:
 *   get:
 *     summary: Mendapatkan grafik pendapatan bulanan (12 bulan terakhir)
 *     tags: [AdminDashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data pendapatan bulanan
 */
// Endpoint untuk Grafik Pendapatan Bulanan (12 Bulan Terakhir)
adminDashboardRouter.get("/stats/monthly-revenue", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    // Query untuk mengambil pendapatan per bulan selama 12 bulan terakhir
    // Hanya menghitung status PAID, CHECK_IN, CHECK_OUT
    const query = `
      SELECT 
        TO_CHAR(date_trunc('month', created_at), 'Mon YYYY') as month_label,
        EXTRACT(MONTH FROM created_at) as month_number,
        EXTRACT(YEAR FROM created_at) as year_number,
        SUM(total_price) as total_revenue,
        COUNT(id) as total_bookings
      FROM bookings
      WHERE 
        status IN ('PAID', 'CHECK_IN', 'CHECK_OUT') 
        AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY 1, 2, 3
      ORDER BY year_number DESC, month_number DESC
    `;

    const result = await db.query(query);

    // Format data agar mudah dikonsumsi frontend (Chart.js / Recharts)
    // Kita balik urutannya agar dari bulan terlama ke terbaru
    const chartData = result.rows.reverse().map(row => ({
      month: row.month_label,
      revenue: parseInt(row.total_revenue),
      bookings: parseInt(row.total_bookings)
    }));

    return res.json(chartData);
  } catch (err) {
    console.error("Monthly Revenue Stats Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = { adminDashboardRouter };
