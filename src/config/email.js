const axios = require("axios");

const sendEmail = async (options) => {
  const { to, subject, text, html } = options;

  if (process.env.BREVO_API_KEY) {
    console.log("[Email] Attempting via Brevo API...");
    try {
      const senderEmail = process.env.EMAIL_USER || "noreply@camping.com";
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
      throw err;
    }
  }

  console.warn(`[Email] No email service configured. Message to ${to}: ${subject}`);
  return { success: false, message: "No email service configured" };
};

const isEmailConfigured = Boolean(process.env.BREVO_API_KEY);

module.exports = { sendEmail, isEmailConfigured };

