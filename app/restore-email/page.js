import Link from "next/link";
import { db } from "@/lib/db";
import { verifyEmailUndoToken } from "@/lib/email-undo-token";
import { SUPPORT_EMAIL } from "@/lib/mail";
import { undoEmailChange } from "@/app/actions";

export const metadata = { title: "Undo email change — Trekkster", robots: { index: false } };

// Where the undo link in a "your email was changed" notice lands. Opening it
// changes nothing — mail scanners open links on their own — the button does.
// The signed token stands in for signing in (see lib/email-undo-token.js),
// since whoever changed the email may also have changed what signing in needs.
export default async function RestoreEmail({ searchParams }) {
  const { t = "", taken } = await searchParams;
  const claim = await verifyEmailUndoToken(t);
  const user = claim ? await db.user.findUnique({ where: { id: claim.userId } }) : null;
  const help = (
    <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
      Need help? Email <a href={"mailto:" + SUPPORT_EMAIL}>{SUPPORT_EMAIL}</a>.
    </p>
  );

  let body;
  if (!claim || !user) {
    body = (
      <>
        <h3 style={{ margin: 0 }}>This link has expired or isn't valid</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          Undo links work for 7 days after the email is changed.
        </p>
        {help}
      </>
    );
  } else if (taken) {
    body = (
      <>
        <h3 style={{ margin: 0 }}>That address belongs to another account now</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          So the account can't be moved back to <span style={{ color: "var(--color-text)" }}>{claim.email}</span> automatically.
        </p>
        {help}
      </>
    );
  } else if (user.email === claim.email) {
    body = (
      <>
        <h3 style={{ margin: 0 }}>Your account already uses this address</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          It signs in with <span style={{ color: "var(--color-text)" }}>{claim.email}</span>. If you can't get in,{" "}
          <Link href="/forgot-password">reset your password</Link>.
        </p>
        {help}
      </>
    );
  } else {
    body = (
      <>
        <div className="card-kicker">Undo email change</div>
        <h3 style={{ margin: 0 }}>Move your account back to {claim.email}?</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          This also signs everyone out of the account and stops the current password working, since whoever
          changed the email knows it. We'll send a code to{" "}
          <span style={{ color: "var(--color-text)" }}>{claim.email}</span> so you can choose a new one.
        </p>
        <form action={undoEmailChange}>
          <input type="hidden" name="t" value={t} />
          <button type="submit" className="btn btn-primary">
            Move it back and secure my account<i className="ph ph-arrow-right" />
          </button>
        </form>
        {help}
      </>
    );
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 40 }}>
      <div style={{ width: "min(440px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--color-accent)", boxShadow: "0 0 12px var(--color-accent)" }} />
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 17 }}>Trekkster</span>
        </div>
        <div className="card elev-sm" style={{ padding: 26, gap: 14 }}>
          {body}
        </div>
      </div>
    </div>
  );
}
