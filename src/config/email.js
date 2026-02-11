const nodemailer = require("nodemailer");
const axios = require("axios");

let mailTransporter = null;

// Initialize SMTP if variables exist
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  const config = {
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === "true",
    connectionTimeout: 5000,
    pool: true,
    tls: { rejectUnauthorized: false }
  };

  mailTransporter = nodemailer.createTransport(config);
  console.log("SMTP Email service initialized.");
}

/**
 * Universal function to send email
 * Priority: Resend API > SMTP > Log (Fallback)
 */
const sendEmail = async (options) => {
  const { to, subject, text, html } = options;
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev"; // Default Resend test email

  // 1. Try Resend API if API Key is available
  if (process.env.RESEND_API_KEY) {
    console.log("[Email] Attempting via Resend API...");
    try {
      const response = await axios.post(
        "https://api.resend.com/emails",
        { 
          from: "onboarding@resend.dev", // Pakai ini untuk testing akun baru
          to, 
          subject, 
          text, 
          html 
        },
        { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}` } }
      );
      console.log("[Email] SUCCESS via Resend API:", response.data.id);
      return { success: true, id: response.data.id };
    } catch (err) {
      console.error("[Email] Resend API ERROR:", err.response?.data || err.message);
      // Fallback to SMTP
    }
  } else {
    console.warn("[Email] RESEND_API_KEY not found in environment variables.");
  }

  // 2. Try SMTP if initialized
  if (mailTransporter) {
    console.log(`[Email] Attempting via SMTP (${process.env.EMAIL_HOST || 'default'})...`);
    try {
      const info = await mailTransporter.sendMail({ 
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER, 
        to, 
        subject, 
        text, 
        html 
      });
      console.log("[Email] SUCCESS via SMTP:", info.messageId);
      return { success: true, id: info.messageId };
    } catch (err) {
      console.error("[Email] SMTP ERROR:", err.message);
      throw err;
    }
  }

  // 3. Fallback: Log to console if no service is configured
  console.warn(`[Email] No email service configured. Message to ${to}: ${subject}`);
  return { success: false, message: "No email service configured" };
};

module.exports = { mailTransporter, sendEmail };

