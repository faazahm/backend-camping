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
  app.use(helmet());
  
  // Serve folder uploads secara statis agar foto bisa diakses
  app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

  // Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

  app.use("/auth", authRouter);
  app.use("/booking", bookingRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/admin/dashboard", adminDashboardRouter);
  app.use("/admin/notifications", notificationRouter);
  app.use("/admin/reports", reportsRouter);
  app.use("/admin/reviews", adminReviewsRouter);
  app.use("/admin/questions", adminQuestionsRouter);
  app.use("/admin", adminRouter);
  app.use("/profile", profileRouter);
  app.use("/reviews", reviewsRouter);

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

  app.get("/", (req, res) => {
    res.json({ status: "ok", message: "Backend camping API running" });
  });

  return app;
}

module.exports = { createApp };
