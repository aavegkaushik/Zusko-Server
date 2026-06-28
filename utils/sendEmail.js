import nodemailer from "nodemailer";

export const sendEmail = async ({
  to,
  subject,
  html,
  from,
}) => {
  console.log(
  "VENDOR SMTP PASS:",
  process.env.SMTP_PASS?.slice(-10)
);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter.sendMail({
    from: from || process.env.MAIL_FROM,
    to,
    subject,
    html,
  });
};