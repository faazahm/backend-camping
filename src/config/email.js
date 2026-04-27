const nodemailer = require("nodemailer");
const axios = require("axios");

// Gmail SMTP transporter (no IP whitelist needed - uses App Password)
let gmailTransporter = null;
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  gmailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    connectionTimeout: 10000,
    tls: { rejectUnauthorized: false },
  });
  console.log("[Email] Gmail SMTP transporter initialized.");
}

// Legacy SMTP transporter (kept as fallback)
let mailTransporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  mailTransporter = nodemailer.createTransport({
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === "true",
    connectionTimeout: 10000,
    tls: { rejectUnauthorized: false },
  });
  console.log("[Email] Legacy SMTP transporter initialized.");
}

/**
 * Universal function to send email
 * Priority: Gmail SMTP > Resend API > Brevo API > Legacy SMTP > Log
 *
 * NOTE: Gmail App Password tidak membutuhkan IP whitelist, sehingga lebih
 * reliable di environment cloud seperti Railway yang memakai IP dinamis.
 */
const sendEmail = async (options) => {
  const { to, subject, text, html } = options;

  // 1. Try Gmail SMTP first (most reliable on Railway - no IP restriction)
  if (gmailTransporter) {
    console.log("[Email] Attempting via Gmail SMTP...");
    try {
      const info = await gmailTransporter.sendMail({
        from: `"Camping App" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        text,
        html,
      });
      console.log("[Email] SUCCESS via Gmail SMTP:", info.messageId);
      return { success: true, id: info.messageId };
    } catch (err) {
      console.error("[Email] Gmail SMTP ERROR:", err.message);
      // Fall through to next method
    }
  }

  // 2. Try Resend API
  if (process.env.RESEND_API_KEY) {
    console.log("[Email] Attempting via Resend API...");
    try {
      const response = await axios.post(
        "https://api.resend.com/emails",
        {
          from: process.env.EMAIL_FROM || "onboarding@resend.dev",
          to,
          subject,
          text,
          html,
        },
        { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}` } }
      );
      console.log("[Email] SUCCESS via Resend API:", response.data.id);
      return { success: true, id: response.data.id };
    } catch (err) {
      console.error("[Email] Resend API ERROR:", err.response?.data?.message || err.message);
    }
  }

  // 3. Try Brevo API (requires IP whitelist — may fail on Railway)
  if (process.env.BREVO_API_KEY) {
    console.log("[Email] Attempting via Brevo API...");
    try {
      const senderEmail = process.env.GMAIL_USER || process.env.EMAIL_USER;
      const response = await axios.post(
        "https://api.brevo.com/v3/smtp/email",
        {
          sender: { email: senderEmail, name: "Camping App" },
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: html || text,
        },
        { headers: { "api-key": process.env.BREVO_API_KEY.trim() } }
      );
      console.log("[Email] SUCCESS via Brevo API:", response.data.messageId);
      return { success: true, id: response.data.messageId };
    } catch (err) {
      console.error("[Email] Brevo API ERROR:", err.response?.data || err.message);
    }
  }

  // 4. Try legacy SMTP as last resort
  if (mailTransporter) {
    console.log(`[Email] Attempting via legacy SMTP (${process.env.EMAIL_HOST || "smtp.gmail.com"})...`);
    try {
      const info = await mailTransporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        text,
        html,
      });
      console.log("[Email] SUCCESS via legacy SMTP:", info.messageId);
      return { success: true, id: info.messageId };
    } catch (err) {
      console.error("[Email] Legacy SMTP ERROR:", err.message);
      throw err;
    }
  }

  // Final fallback: log only
  console.warn(`[Email] No email service configured. Message to ${to}: ${subject}`);
  return { success: false, message: "No email service configured" };
};

module.exports = { mailTransporter, sendEmail };

