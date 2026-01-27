const express = require("express");
const { authenticate, requireAdmin } = require("../../middleware/auth");

const { adminUsersRouter } = require("./users");
const { adminCampsRouter } = require("./camps");
const { adminBookingsRouter } = require("./bookings");
const { adminEquipmentsRouter } = require("./equipments");

const adminRouter = express.Router();

// Middleware Authentication & Admin Check applied to all sub-routes
adminRouter.use(authenticate, requireAdmin);

// Mount Sub-Routers
adminRouter.use("/users", adminUsersRouter);
adminRouter.use("/camps", adminCampsRouter);
adminRouter.use("/bookings", adminBookingsRouter);
adminRouter.use("/equipments", adminEquipmentsRouter);

/**
 * @swagger
 * tags:
 *   - name: AdminUsers
 *     description: Manajemen pengguna
 *   - name: AdminCamps
 *     description: Manajemen lokasi camp
 *   - name: AdminBookings
 *     description: Manajemen booking
 *   - name: AdminEquipments
 *     description: Manajemen peralatan
 */

module.exports = { adminRouter };
