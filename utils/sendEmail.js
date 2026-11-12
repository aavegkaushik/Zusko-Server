import nodemailer from "nodemailer";
import logger from "./logger.js";

let pooledTransporter = null;

const getTransporter = () => {
  if (!pooledTransporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const isSecure = port === 465;

    pooledTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: isSecure,
      pool: true, // Reusable connection pool
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 10000, // 10s timeout on initial connect
      greetingTimeout: 5000, // 5s timeout on greeting
      socketTimeout: 15000, // 15s timeout on socket operations
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    pooledTransporter.on("error", (err) => {
      logger.warn(`SMTP transporter pool warning: ${err.message}`);
    });
  }
  return pooledTransporter;
};

export const sendEmail = async ({
  to,
  subject,
  html,
  from,
}) => {
  const transporter = getTransporter();

  return transporter.sendMail({
    from: from || process.env.MAIL_FROM,
    to,
    subject,
    html,
  });
};

export default sendEmail;
