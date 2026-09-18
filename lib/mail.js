// Dev: print the code. Prod: wire nodemailer (SMTP_URL) or Resend here.
export async function sendVerificationCode(email, code) {
  if (!process.env.SMTP_URL) {
    console.log("\n[meridian] verification code for " + email + ": " + code + "\n");
    return;
  }
  // TODO: replace with your provider, e.g.
  //   const nodemailer = await import("nodemailer");
  //   const t = nodemailer.createTransport(process.env.SMTP_URL);
  //   await t.sendMail({ to: email, from: process.env.MAIL_FROM,
  //     subject: "Your Meridian code", text: "Code: " + code });
  throw new Error("SMTP_URL is set but no mail transport is implemented — see lib/mail.js");
}
