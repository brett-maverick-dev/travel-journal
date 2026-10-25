import nodemailer from "nodemailer";

export const SUPPORT_EMAIL = "support@trekkster.app";

let transporter;
function getTransporter() {
  // SMTP_URL takes the full connection string, e.g.
  //   smtps://user%40example.com:app-password@smtp.gmail.com:465
  if (!transporter) transporter = nodemailer.createTransport(process.env.SMTP_URL);
  return transporter;
}

async function send(to, subject, text, html) {
  if (!process.env.SMTP_URL) {
    console.log("\n[trekkster] " + subject + " → " + to + "\n" + text + "\n");
    return;
  }
  try {
    await getTransporter().sendMail({
      to, subject, text, ...(html ? { html } : {}),
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

export async function sendEmailChangeCode(email, code) {
  await send(
    email,
    "Confirm your new Trekkster email",
    "Your code to move your Trekkster account to this address is " + code + ".\n\n" +
    "It expires in 10 minutes. If you didn't ask for this, you can ignore this email — " +
    "nothing changes unless the code is entered."
  );
}

// Sent to the current address as soon as a change is requested, so the owner
// hears about it while it can still be stopped.
export async function sendEmailChangeRequested(email, maskedNewEmail, resetUrl) {
  await send(
    email,
    "Your Trekkster email is being changed",
    "Someone signed in to your Trekkster account asked to change its email to " + maskedNewEmail + ".\n\n" +
    "If that was you, enter the code we sent to the new address. If it wasn't, reset your password now " +
    "at " + resetUrl + " — that cancels the change and signs everyone else out.\n\n" +
    "Need help? Email " + SUPPORT_EMAIL + "."
  );
}

// The undo link opens a page that asks before doing anything — mail scanners
// open links on their own.
export async function sendEmailChanged(email, maskedNewEmail, undoUrl) {
  await send(
    email,
    "Your Trekkster email was changed",
    "Your Trekkster account now uses " + maskedNewEmail + " instead of this address, and other devices " +
    "have been signed out.\n\n" +
    "If you didn't make this change, undo it here:\n" + undoUrl + "\n\n" +
    "That moves the account back to this address, signs everyone out, and has you choose a new password. " +
    "The link works for 7 days. Need help? Email " + SUPPORT_EMAIL + "."
  );
}

const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

// "@sam (Sam Lee) wants to be your travel buddy", with Accept / Decline /
// Block links. Each link opens a confirmation page rather than acting on
// its own: mail scanners routinely open links in incoming mail, and that
// mustn't be able to answer the request for you.
export async function sendBuddyRequestEmail(to, { fromName, fromHandle, profileUrl, links }) {
  const who = fromName ? fromName + " (@" + fromHandle + ")" : "@" + fromHandle;
  const subject = who + " wants to be your travel buddy on Trekkster";
  const text =
    who + " sent you a travel buddy request on Trekkster.\n\n" +
    "See their profile: " + profileUrl + "\n\n" +
    "Accept:  " + links.accept + "\n" +
    "Decline: " + links.decline + "\n" +
    "Block:   " + links.block + "\n\n" +
    "Each link asks you to confirm before anything happens, and works for 30 days. " +
    "You can also answer from the Buddies page once you're signed in. " +
    "If you don't know this person, you can ignore this email.";
  const button = (href, label, primary) =>
    '<a href="' + escapeHtml(href) + '" style="display:inline-block;margin:0 8px 8px 0;padding:10px 18px;border-radius:8px;' +
    "font:600 14px/1 system-ui,sans-serif;text-decoration:none;" +
    (primary ? "background:#9184d9;color:#fff" : "border:1px solid #c9c9d4;color:#333") + '">' + label + "</a>";
  const html =
    '<div style="font:15px/1.55 system-ui,sans-serif;color:#222;max-width:520px">' +
    "<p><strong>" + escapeHtml(who) + "</strong> sent you a travel buddy request on Trekkster.</p>" +
    '<p><a href="' + escapeHtml(profileUrl) + '">See their profile</a></p>' +
    "<p>" + button(links.accept, "Accept", true) + button(links.decline, "Decline") + button(links.block, "Block") + "</p>" +
    '<p style="color:#666;font-size:13px">Each button asks you to confirm before anything happens, and works for 30 days. ' +
    "If you don't know this person, you can ignore this email.</p></div>";
  await send(to, subject, text, html);
}
