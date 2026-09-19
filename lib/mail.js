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
    console.log("\n[trekkster] " + subject + " → " + to + "\n" + text + "\n");
    return;
  }
  try {
    await getTransporter().sendMail({
      to, subject, text,
      from: process.env.MAIL_FROM || "Trekkster <no-reply@example.com>"
    });
  } catch (err) {
    // Don't take down signup/reset over a mail-provider hiccup (wrong
    // password, SMTP AUTH not enabled yet, tenant still provisioning, …) —
    // log the failure and fall back to printing the code so it's still
    // reachable from the runtime log while the SMTP setup gets sorted out.
    console.error("[trekkster] mail send failed: " + err.message);
    console.log("\n[trekkster] " + subject + " → " + to + " (SMTP failed, see above)\n" + text + "\n");
  }
}

export async function sendVerificationCode(email, code) {
  await send(
    email,
    "Your Trekkster confirmation code",
    "Your confirmation code is " + code + ".\n\nIt expires in 10 minutes."
  );
}

export async function sendPasswordReset(email, code) {
  await send(
    email,
    "Reset your Trekkster password",
    "Your password reset code is " + code + ".\n\n" +
    "It expires in 10 minutes. If you didn't request this, you can ignore this email — " +
    "your password won't change unless you enter this code."
  );
}
