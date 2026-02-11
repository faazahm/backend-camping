const nodemailer = require("nodemailer");

let mailTransporter = null;

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  const config = {
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  };

  if (process.env.EMAIL_HOST && process.env.EMAIL_PORT) {
    // Manual SMTP configuration (Prioritized for stability on cloud)
    config.host = process.env.EMAIL_HOST;
    config.port = Number(process.env.EMAIL_PORT);
    config.secure = process.env.EMAIL_SECURE === "true"; // true for 465, false for other ports
    
    // Add connection timeout settings
    config.connectionTimeout = 10000; // 10s
    config.greetingTimeout = 10000;   // 10s
    config.socketTimeout = 10000;     // 10s
  } else if (process.env.EMAIL_SERVICE) {
    // Configuration for services like 'gmail'
    config.service = process.env.EMAIL_SERVICE;
  }

  if (config.service || config.host) {
    mailTransporter = nodemailer.createTransport(config);
    console.log("Email service configured.");
  }
}

if (!mailTransporter) {
  console.warn("Email env variables are not fully configured");
}

module.exports = { mailTransporter };

