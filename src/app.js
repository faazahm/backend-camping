const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { authRouter } = require("./routes/auth");
const { bookingRouter } = require("./routes/user/booking");
const { adminRouter } = require("./routes/admin/index");
const { dashboardRouter } = require("./routes/user/dashboard");
const { adminDashboardRouter } = require("./routes/admin/dashboard");
const { notificationRouter } = require("./routes/admin/notifications");
const { reportsRouter } = require("./routes/admin/reports");
const { profileRouter } = require("./routes/user/profile");
const { reviewsRouter } = require("./routes/user/reviews");
const { adminReviewsRouter } = require("./routes/admin/reviews");
const { adminQuestionsRouter } = require("./routes/admin/questions");
const path = require("path");
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');

function createApp() {
  const app = express();

  // Aktifkan trust proxy agar express-rate-limit bisa membaca IP asli user di Railway/Cloud
  app.set('trust proxy', 1);

  app.use(cors());
  app.use(express.json());
  
  // Konfigurasi Helmet agar tidak memblokir resource cross-origin (gambar)
  app.use(helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  
  // Serve folder uploads secara statis agar foto bisa diakses
  app.use("/uploads", express.static(path.join(__dirname, "../uploads"), {
    setHeaders: (res) => {
      res.set("Cross-Origin-Resource-Policy", "cross-origin");
    }
  }));

  // Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

  // Define all routers in a function or a shared object to easily mount them with/without prefix
  const mountRoutes = (router) => {
    router.use("/auth", authRouter);
    router.use("/booking", bookingRouter);
    router.use("/dashboard", dashboardRouter);
    router.use("/admin/dashboard", adminDashboardRouter);
    router.use("/admin/notifications", notificationRouter);
    router.use("/admin/reports", reportsRouter);
    router.use("/admin/reviews", adminReviewsRouter);
    router.use("/admin/questions", adminQuestionsRouter);
    router.use("/admin", adminRouter);
    router.use("/profile", profileRouter);
    router.use("/reviews", reviewsRouter);
  };

  // Mount with /api prefix
  const apiRouter = express.Router();
  mountRoutes(apiRouter);
  app.use("/api", apiRouter);

  // Also mount at root for backward compatibility
  mountRoutes(app);

  app.get("/", (req, res) => {
    res.json({ status: "ok", message: "Backend camping API running" });
  });

  // 404 Handler with Logging (To debug 404 issues)
  app.use((req, res, next) => {
    console.warn(`[404] ${req.method} ${req.originalUrl} - Not Found`);
    res.status(404).json({ 
      message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`,
      available_routes: ["/profile", "/api/profile", "/auth", "/api/auth"]
    });
  });

  app.use((err, req, res, next) => {
    if (
      err instanceof SyntaxError &&
      err.status === 400 &&
      Object.prototype.hasOwnProperty.call(err, "body")
    ) {
      return res.status(400).json({ message: "Invalid JSON body" });
    }
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  });

  return app;
}

module.exports = { createApp };
