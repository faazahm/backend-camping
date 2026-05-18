const nodemailer = require("nodemailer");

let gmailTransporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  gmailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    // Pengaturan penting untuk Railway agar koneksi tidak cepat putus
    connectionTimeout: 10000, 
    tls: { rejectUnauthorized: false },
  });
  console.log("[Email] Gmail SMTP transporter initialized.");
}

const sendEmail = async (options) => {
  const { to, subject, text, html } = options;

  if (gmailTransporter) {
    console.log("[Email] Attempting via Gmail SMTP...");
    try {
      const info = await gmailTransporter.sendMail({
        from: `"Camping App" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
        html,
      });
      console.log("[Email] SUCCESS via Gmail SMTP:", info.messageId);
      return { success: true, id: info.messageId };
    } catch (err) {
      console.error("[Email] Gmail SMTP ERROR:", err.message);
      throw err;
    }
  }

  console.warn(`[Email] No email service configured. Message to ${to}: ${subject}`);
  return { success: false, message: "No email service configured" };
};

const isEmailConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

module.exports = { sendEmail, isEmailConfigured };

