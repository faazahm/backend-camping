const express = require("express");
const { db } = require("../../config/db");
const { authenticate } = require("../../middleware/auth");
const { uploadToSupabase } = require("../../utils/supabase");
const multer = require("multer");
const path = require("path");
const { getIO } = require("../../realtime/io");

const bookingRouter = express.Router();

// Multer memory storage for payment proof
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const isValid = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
    cb(isValid ? null : new Error("Hanya file gambar yang diperbolehkan"), isValid);
  }
});

/**
 * @swagger
 * /booking/camps:
 *   get:
 *     summary: Mendapatkan daftar semua camp yang aktif (Public)
 *     tags: [Booking]
 *     responses:
 *       200:
 *         description: Daftar camp tersedia
 */
bookingRouter.get("/camps", async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const result = await db.query(
      `SELECT public_id, name, description, location, nightly_price, photo_url 
       FROM "camps" 
       WHERE is_active = true 
       ORDER BY name ASC`
    );

    return res.json(
      result.rows.map((row) => ({
        id: row.public_id,
        name: row.name,
        description: row.description,
        location: row.location,
        nightlyPrice: row.nightly_price,
        image_url: row.photo_url ? (row.photo_url.startsWith('http') ? row.photo_url : `${req.protocol}://${req.get("host")}/${row.photo_url}`) : null,
      }))
    );
  } catch (err) {
    console.error("Get User Camps Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * tags:
 *   name: Booking
 *   description: Manajemen pemesanan camping dan peralatan
 */

const PRICE_PER_PERSON_PER_DAY = 10000;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @swagger
 * /booking/equipments:
 *   get:
 *     summary: Cek ketersediaan peralatan
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Tanggal mulai (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Tanggal selesai (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Daftar peralatan dengan stok tersedia
 *       400:
 *         description: Format tanggal salah
 */
bookingRouter.get("/equipments", authenticate, async (req, res) => {
  try {
    if (!db) {
      return res
        .status(500)
        .json({ message: "Database is not configured on the server" });
    }

    const { startDate, endDate } = req.query;

    const equipmentsResult = await db.query(
      'SELECT * FROM "equipments" ORDER BY id ASC'
    );

    if (!startDate || !endDate) {
      return res.json(equipmentsResult.rows);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: "Format tanggal tidak valid" });
    }

    if (end <= start) {
      return res
        .status(400)
        .json({ message: "endDate harus lebih besar dari startDate" });
    }

    const equipments = equipmentsResult.rows;

      const usageQuery = `
      WITH days AS (
        SELECT generate_series($2::date, ($3::date - INTERVAL '1 day'), INTERVAL '1 day')::date AS day
      )
      SELECT
        d.day,
        COALESCE(SUM(be.quantity), 0) as used
      FROM days d
      LEFT JOIN "bookings" b
        ON b.status IN ('PAID', 'CHECK_IN')
        AND d.day >= b.start_date::date
        AND d.day < b.end_date::date
      LEFT JOIN "booking_equipments" be
        ON be.booking_id = b.id
        AND be.equipment_id = $1
      GROUP BY d.day
    `;

    const resultWithAvailability = [];

    for (const eq of equipments) {
      const usageResult = await db.query(usageQuery, [
        eq.id,
        startDate,
        endDate,
      ]);

      let maxUsed = 0;
      for (const row of usageResult.rows) {
        const used = Number(row.used);
        if (used > maxUsed) {
          maxUsed = used;
        }
      }

      const remaining = Number(eq.stock) - maxUsed;

      resultWithAvailability.push({
        ...eq,
        availableStock: remaining < 0 ? 0 : remaining,
      });
    }

    return res.json(resultWithAvailability);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * @swagger
 * /booking/camps/{campId}/availability:
 *   get:
 *     summary: Cek ketersediaan camp
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID Camp (UUID)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Tanggal mulai
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Tanggal selesai
 *     responses:
 *       200:
 *         description: Ketersediaan camp
 *       400:
 *         description: Input tidak valid
 *       404:
 *         description: Camp tidak ditemukan
 */
bookingRouter.get(
  "/camps/:campId/availability",
  authenticate,
  async (req, res) => {
    try {
      if (!db) {
        return res
          .status(500)
          .json({ message: "Database is not configured on the server" });
      }

      const campPublicId = req.params.campId;
      const { startDate, endDate } = req.query;

      if (!campPublicId || !startDate || !endDate) {
        return res.status(400).json({
          message: "campId, startDate, dan endDate wajib diisi",
        });
      }

      if (!UUID_REGEX.test(campPublicId)) {
        return res
          .status(400)
          .json({ message: "campId harus berupa UUID yang valid" });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return res.status(400).json({ message: "Format tanggal tidak valid" });
      }

      if (end <= start) {
        return res
          .status(400)
          .json({ message: "endDate harus lebih besar dari startDate" });
      }

      const campResult = await db.query(
        'SELECT id, public_id, daily_capacity FROM "camps" WHERE public_id = $1 AND is_active = true',
        [campPublicId]
      );

      if (campResult.rows.length === 0) {
        return res.status(404).json({ message: "Camp tidak ditemukan" });
      }

      const campRow = campResult.rows[0];
      const campId = campRow.id;
      const capacity = campRow.daily_capacity;

      const query = `
        WITH days AS (
          SELECT generate_series($2::date, ($3::date - INTERVAL '1 day'), INTERVAL '1 day')::date AS day
        )
        SELECT
          d.day,
          COALESCE(SUM(b.people_count), 0) AS used
        FROM days d
        LEFT JOIN "bookings" b
          ON b.camp_id = $1
         AND b.status IN ('PAID', 'CHECK_IN')
         AND d.day >= b.start_date::date
         AND d.day < b.end_date::date
        GROUP BY d.day
        ORDER BY d.day;
      `;

      const { rows } = await db.query(query, [campId, startDate, endDate]);

      const availability = rows.map((row) => ({
        date: row.day,
        used: Number(row.used),
        remaining: capacity - Number(row.used),
      }));

      return res.json({
        campId: campPublicId,
        capacity,
        availability,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
);

/**
 * @swagger
 * /booking:
 *   post:
 *     summary: Membuat booking baru
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - campId
 *               - startDate
 *               - endDate
 *               - peopleCount
 *             properties:
 *               campId:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               peopleCount:
 *                 type: integer
 *               equipments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     equipmentId:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                     nights:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Booking berhasil dibuat
 *       400:
 *         description: Input tidak valid atau kuota penuh
 *       404:
 *         description: Camp tidak ditemukan
 */
bookingRouter.post("/", authenticate, async (req, res) => {
  const client = db && (await db.connect());

  try {
    if (!db || !client) {
      return res
        .status(500)
        .json({ message: "Database is not configured on the server" });
    }

    const body =
      req.body && typeof req.body === "object" ? req.body : {};
    const {
      campId: campPublicId,
      startDate,
      endDate,
      peopleCount,
      equipments,
    } = body;

    if (!campPublicId || !startDate || !endDate || !peopleCount) {
      return res.status(400).json({
        message: "campId, startDate, endDate, dan peopleCount wajib diisi",
      });
    }

    if (!UUID_REGEX.test(campPublicId)) {
      return res
        .status(400)
        .json({ message: "campId harus berupa UUID yang valid" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: "Format tanggal tidak valid" });
    }

    if (end <= start) {
      return res
        .status(400)
        .json({ message: "endDate harus lebih besar dari startDate" });
    }

    if (peopleCount <= 0) {
      return res
        .status(400)
        .json({ message: "peopleCount harus lebih besar dari 0" });
    }

    await client.query("BEGIN");

    const campResult = await client.query(
      'SELECT id, public_id, daily_capacity FROM "camps" WHERE public_id = $1 AND is_active = true FOR UPDATE',
      [campPublicId]
    );

    if (campResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Camp tidak ditemukan" });
    }

    const campRow = campResult.rows[0];
    const campId = campRow.id;
    const capacity = campRow.daily_capacity;

    const lockQuery = `
      SELECT id
      FROM "bookings"
      WHERE camp_id = $1
      AND status IN ('PAID', 'CHECK_IN')
      AND start_date::date < $3::date
      AND end_date::date > $2::date
      FOR UPDATE;
    `;

    await client.query(lockQuery, [campId, startDate, endDate]);

    const availabilityQuery = `
      WITH days AS (
        SELECT generate_series($2::date, ($3::date - INTERVAL '1 day'), INTERVAL '1 day')::date AS day
      )
      SELECT
        d.day,
        COALESCE(SUM(b.people_count), 0) AS used
      FROM days d
      LEFT JOIN "bookings" b
        ON b.camp_id = $1
       AND b.status IN ('PAID', 'CHECK_IN')
       AND d.day >= b.start_date::date
       AND d.day < b.end_date::date
      GROUP BY d.day
      ORDER BY d.day;
    `;

    const availabilityResult = await client.query(availabilityQuery, [
      campId,
      startDate,
      endDate,
    ]);

    const insufficient = availabilityResult.rows.find((row) => {
      const used = Number(row.used);
      return used + Number(peopleCount) > capacity;
    });

    if (insufficient) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Kuota penuh pada tanggal yang dipilih",
        date: insufficient.day,
      });
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const startUTC = Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate()
    );
    const endUTC = Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      end.getUTCDate()
    );
    const nights = Math.max(1, Math.floor((endUTC - startUTC) / msPerDay));

    let totalPrice = nights * PRICE_PER_PERSON_PER_DAY * Number(peopleCount);
    const equipmentInserts = [];

    if (equipments && Array.isArray(equipments) && equipments.length > 0) {
      for (const item of equipments) {
        const {
          equipmentId: equipmentPublicId,
          quantity,
          nights: itemNights,
        } = item;
        if (quantity <= 0) continue;

        if (!UUID_REGEX.test(equipmentPublicId)) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: "equipmentId harus berupa UUID yang valid",
          });
        }

        const eqResult = await client.query(
          'SELECT * FROM "equipments" WHERE public_id = $1',
          [equipmentPublicId]
        );
        if (eqResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Alat dengan ID ${equipmentPublicId} tidak ditemukan`,
          });
        }
        const eq = eqResult.rows[0];
        const equipmentId = eq.id;

        let rentalNights = Number(itemNights);
        if (!itemNights && itemNights !== 0) {
          rentalNights = nights;
        }
        if (!Number.isFinite(rentalNights) || rentalNights <= 0) {
          await client.query("ROLLBACK");
          return res
            .status(400)
            .json({ message: "nights untuk alat harus lebih besar dari 0" });
        }
        if (rentalNights > nights) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: "nights untuk alat tidak boleh melebihi durasi menginap",
          });
        }

        const usageQuery = `
          WITH days AS (
            SELECT generate_series($2::date, ($3::date - INTERVAL '1 day'), INTERVAL '1 day')::date AS day
          )
          SELECT
            d.day,
            COALESCE(SUM(be.quantity), 0) as used
          FROM days d
          LEFT JOIN bookings b
            ON b.status IN ('PAID', 'CHECK_IN')
            AND d.day >= b.start_date::date
            AND d.day < b.end_date::date
          LEFT JOIN booking_equipments be
            ON be.booking_id = b.id
            AND be.equipment_id = $1
          GROUP BY d.day
        `;

        const usageResult = await client.query(usageQuery, [
          equipmentId,
          startDate,
          endDate,
        ]);

        const isFull = usageResult.rows.find(
          (row) => Number(row.used) + Number(quantity) > eq.stock
        );
        if (isFull) {
          await client.query("ROLLBACK");
          return res
            .status(400)
            .json({ message: `Stok alat '${eq.name}' tidak mencukupi (sisa: ${eq.stock - Number(isFull.used)})` });
        }

        const itemPriceTotal = eq.price * quantity * rentalNights;
        totalPrice += itemPriceTotal;
        equipmentInserts.push({
          equipmentId,
          quantity,
          nights: rentalNights,
          price: itemPriceTotal,
        });
      }
    }

    const insertResult = await client.query(
      'INSERT INTO "bookings" (user_id, camp_id, start_date, end_date, people_count, total_price, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, public_id, status',
      [
        req.user.id,
        campId,
        startDate,
        endDate,
        peopleCount,
        totalPrice,
        "PENDING",
      ]
    );

    const bookingRow = insertResult.rows[0];
    const bookingId = bookingRow.id;

    for (const ins of equipmentInserts) {
      await client.query(
        'INSERT INTO "booking_equipments" (booking_id, equipment_id, quantity, nights, price) VALUES ($1, $2, $3, $4, $5)',
        [bookingId, ins.equipmentId, ins.quantity, ins.nights, ins.price]
      );
    }

    await client.query("COMMIT");

    const io = getIO();

    if (io) {
      io.emit("booking:created", {
        id: bookingRow.public_id,
        userId: req.user.id,
        campId: campPublicId,
        startDate,
        endDate,
        peopleCount,
        totalPrice,
        status: bookingRow.status,
      });
    }

    return res.status(201).json({
      id: bookingRow.public_id,
      campId: campPublicId,
      startDate,
      endDate,
      peopleCount,
      totalPrice,
      status: bookingRow.status,
    });
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error("Booking error:", err);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (client) {
      client.release();
    }
  }
});

/**
 * @swagger
 * /booking/{bookingId}/equipments:
 *   put:
 *     summary: Update peralatan booking
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
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
 *               - equipments
 *             properties:
 *               equipments:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     equipmentId:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                     nights:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Peralatan berhasil diupdate
 *       400:
 *         description: Input tidak valid
 *       404:
 *         description: Booking tidak ditemukan
 */
bookingRouter.put("/:bookingId/equipments", authenticate, async (req, res) => {
  const client = db && (await db.connect());

  try {
    if (!db || !client) {
      return res
        .status(500)
        .json({ message: "Database is not configured on the server" });
    }

    const bookingPublicId = req.params.bookingId;
    const body =
      req.body && typeof req.body === "object" ? req.body : {};
    const { equipments } = body;

    if (!bookingPublicId || !equipments || !Array.isArray(equipments)) {
      return res.status(400).json({
        message: "bookingId dan equipments wajib diisi",
      });
    }

    if (!UUID_REGEX.test(bookingPublicId)) {
      return res
        .status(400)
        .json({ message: "bookingId harus berupa UUID yang valid" });
    }

    await client.query("BEGIN");

    const bookingResult = await client.query(
      'SELECT id, public_id, user_id, camp_id, start_date, end_date, people_count, total_price FROM "bookings" WHERE public_id = $1 FOR UPDATE',
      [bookingPublicId]
    );

    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    const booking = bookingResult.rows[0];
    const bookingId = booking.id;

    if (booking.user_id !== req.user.id && req.user.role !== "ADMIN") {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Forbidden" });
    }

    const startDate = booking.start_date;
    const endDate = booking.end_date;
    const peopleCount = booking.people_count;
    const campId = booking.camp_id;

    const start = new Date(startDate);
    const end = new Date(endDate);

    const msPerDay = 1000 * 60 * 60 * 24;
    const startUTC = Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate()
    );
    const endUTC = Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      end.getUTCDate()
    );
    const nights = Math.max(1, Math.floor((endUTC - startUTC) / msPerDay));

    const campResult = await client.query(
      'SELECT id, daily_capacity FROM "camps" WHERE id = $1 AND is_active = true FOR UPDATE',
      [campId]
    );

    if (campResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Camp tidak ditemukan" });
    }

    const capacity = campResult.rows[0].daily_capacity;

    const lockQuery = `
      SELECT id
      FROM "bookings"
      WHERE camp_id = $1
        AND status IN ('PAID', 'CHECK_IN')
        AND start_date::date < $3::date
        AND end_date::date > $2::date
      FOR UPDATE;
    `;

    await client.query(lockQuery, [campId, startDate, endDate]);

    const availabilityQuery = `
      WITH days AS (
        SELECT generate_series($2::date, ($3::date - INTERVAL '1 day'), INTERVAL '1 day')::date AS day
      )
      SELECT
        d.day,
        COALESCE(SUM(b.people_count), 0) AS used
      FROM days d
      LEFT JOIN "bookings" b
        ON b.camp_id = $1
       AND b.status IN ('PAID', 'CHECK_IN')
       AND d.day >= b.start_date::date
       AND d.day < b.end_date::date
      GROUP BY d.day
      ORDER BY d.day;
    `;

    const availabilityResult = await client.query(availabilityQuery, [
      campId,
      startDate,
      endDate,
    ]);

    const insufficient = availabilityResult.rows.find((row) => {
      const used = Number(row.used);
      return used + Number(peopleCount) > capacity;
    });

    if (insufficient) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Kuota penuh pada tanggal yang dipilih",
        date: insufficient.day,
      });
    }

    await client.query(
      'DELETE FROM "booking_equipments" WHERE booking_id = $1',
      [bookingId]
    );

    let totalPrice =
      nights * PRICE_PER_PERSON_PER_DAY * Number(peopleCount);

    const equipmentInserts = [];

    for (const item of equipments) {
      const {
        equipmentId: equipmentPublicId,
        quantity,
        nights: itemNights,
      } = item;
      if (!equipmentId || !quantity || quantity <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "equipmentId dan quantity untuk setiap alat wajib diisi",
        });
      }

      if (!UUID_REGEX.test(equipmentPublicId)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "equipmentId harus berupa UUID yang valid",
        });
      }

      const eqResult = await client.query(
        'SELECT * FROM "equipments" WHERE public_id = $1',
        [equipmentPublicId]
      );
      if (eqResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: `Alat dengan ID ${equipmentId} tidak ditemukan` });
      }
      const eq = eqResult.rows[0];
      const equipmentId = eq.id;

      let rentalNights = Number(itemNights);
      if (!itemNights && itemNights !== 0) {
        rentalNights = nights;
      }
      if (!Number.isFinite(rentalNights) || rentalNights <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "nights untuk alat harus lebih besar dari 0",
        });
      }
      if (rentalNights > nights) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "nights untuk alat tidak boleh melebihi durasi menginap",
        });
      }

      const usageQuery = `
        WITH days AS (
          SELECT generate_series($2::date, ($3::date - INTERVAL '1 day'), INTERVAL '1 day')::date AS day
        )
        SELECT
          d.day,
          COALESCE(SUM(be.quantity), 0) as used
        FROM days d
        LEFT JOIN bookings b
          ON b.status IN ('PAID', 'CHECK_IN')
          AND d.day >= b.start_date::date
          AND d.day < b.end_date::date
        LEFT JOIN booking_equipments be
          ON be.booking_id = b.id
          AND be.equipment_id = $1
        GROUP BY d.day
      `;

      const usageResult = await client.query(usageQuery, [
        equipmentId,
        startDate,
        endDate,
      ]);

      const isFull = usageResult.rows.find(
        (row) => Number(row.used) + Number(quantity) > eq.stock
      );
      if (isFull) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Stok alat '${eq.name}' tidak mencukupi (sisa: ${
            eq.stock - Number(isFull.used)
          })`,
        });
      }

      const itemPriceTotal = eq.price * quantity * rentalNights;
      totalPrice += itemPriceTotal;
      equipmentInserts.push({
        equipmentId,
        quantity,
        nights: rentalNights,
        price: itemPriceTotal,
      });
    }

    for (const ins of equipmentInserts) {
      await client.query(
        'INSERT INTO "booking_equipments" (booking_id, equipment_id, quantity, nights, price) VALUES ($1, $2, $3, $4, $5)',
        [bookingId, ins.equipmentId, ins.quantity, ins.nights, ins.price]
      );
    }

    await client.query(
      'UPDATE "bookings" SET total_price = $1 WHERE id = $2',
      [totalPrice, bookingId]
    );

    await client.query("COMMIT");

    return res.json({
      id: booking.public_id,
      campId,
      startDate,
      endDate,
      peopleCount,
      totalPrice,
      status: booking.status,
    });
  } catch (err) {
    if (client) {
      await client.query("ROLLBACK");
    }
    console.error("Update equipments error:", err);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (client) {
      client.release();
    }
  }
});

/**
 * @swagger
 * /booking/{bookingId}/pay:
 *   post:
 *     summary: Unggah bukti pembayaran (Upload QR/Transfer)
 *     tags: [Booking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID Booking (UUID)
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               payment_proof:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Bukti pembayaran berhasil diunggah
 *       400:
 *         description: Booking tidak valid atau sudah dibayar
 *       404:
 *         description: Booking tidak ditemukan
 */
// Upload Payment Proof (Manual Verification Flow)
bookingRouter.post("/:bookingId/pay", authenticate, upload.single("payment_proof"), async (req, res) => {
  try {
    if (!db) {
      return res.status(500).json({ message: "Database is not configured" });
    }

    const bookingPublicId = req.params.bookingId;

    if (!bookingPublicId || !UUID_REGEX.test(bookingPublicId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const { rows } = await db.query(
      'SELECT id, user_id, status FROM "bookings" WHERE public_id = $1',
      [bookingPublicId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    const booking = rows[0];

    // Ensure user owns the booking
    if (booking.user_id !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (booking.status !== "PENDING") {
      return res.status(400).json({ message: `Status booking adalah ${booking.status}, tidak bisa mengunggah bukti.` });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File bukti pembayaran wajib diunggah" });
    }

    // Upload to Supabase Storage (Bucket: bookings, Folder: payments)
    let paymentProofUrl;
    try {
      paymentProofUrl = await uploadToSupabase(req.file, "bookings", "payments");
    } catch (uploadError) {
      return res.status(500).json({ message: "Gagal mengunggah bukti ke Supabase" });
    }

    // Update payment_proof, but keep status as PENDING (Admin will verify)
    await db.query('UPDATE "bookings" SET payment_proof = $1 WHERE id = $2', [
      paymentProofUrl,
      booking.id,
    ]);

    return res.json({ 
      message: "Bukti pembayaran berhasil diunggah. Menunggu verifikasi admin.",
      payment_proof_url: paymentProofUrl
    });

  } catch (err) {
    console.error("Payment Upload Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = { bookingRouter };
