import nodemailer from "nodemailer";

let transporter;
function getTransporter() {
  // SMTP_URL takes the full connection string, e.g.
  //   smtps://user%40example.com:app-password@smtp.gmail.com:465
  if (!transporter) transporter = nodemailer.createTransport(process.env.SMTP_URL);
  return transporter;
}

async function send(to, subject, text) {
  if (!process.env.SMTP_URL) {
    console.log("\n[meridian] " + subject + " → " + to + "\n" + text + "\n");
    return;
  }
  await getTransporter().sendMail({
    to, subject, text,
    from: process.env.MAIL_FROM || "Meridian <no-reply@example.com>"
  });
}

export async function sendVerificationCode(email, code) {
  await send(
    email,
    "Your Meridian confirmation code",
    "Your confirmation code is " + code + ".\n\nIt expires in 10 minutes."
  );
}

export async function sendPasswordReset(email, code) {
  await send(
    email,
    "Reset your Meridian password",
    "Your password reset code is " + code + ".\n\n" +
    "It expires in 10 minutes. If you didn't request this, you can ignore this email — " +
    "your password won't change unless you enter this code."
  );
}
