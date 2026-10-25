import { redirect } from "next/navigation";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import PasswordInput from "@/components/PasswordInput";
import { currentUser } from "@/lib/session";
import { requestEmailChange, confirmEmailChange, resendEmailChange, cancelEmailChange } from "@/app/actions";

// Two steps: the new address plus the account password, then the code sent to
// the new address. The email only changes once the code is entered.
export default async function ChangeEmail({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!user.verified) redirect("/verify?email=" + encodeURIComponent(user.email));
  const { sent, wait } = await searchParams;

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 40 }}>
      <div className="card elev-sm" style={{ width: "min(420px, 100%)", padding: 26, gap: 12 }}>
        <div className="card-kicker">Change email</div>
        {user.pendingEmail ? (
          <>
            <h3 style={{ margin: 0 }}>Check your new inbox</h3>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              {sent ? "We sent a new code to " : "We sent a code to "}
              <span style={{ color: "var(--color-text)" }}>{user.pendingEmail}</span>. It expires in ten
              minutes. Your email stays <span style={{ color: "var(--color-text)" }}>{user.email}</span> until
              you enter it.
            </p>
            {wait && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-accent-300)" }}>
                We just sent a code — wait a minute before asking for another.
              </p>
            )}
            <AuthForm action={confirmEmailChange} submitLabel="Change email" hint="Other devices will be signed out.">
              <div className="field">
                <label htmlFor="code">Confirmation code</label>
                <input className="input" id="code" name="code" inputMode="numeric" autoComplete="one-time-code"
                  placeholder="······" required
                  style={{ letterSpacing: "0.5em", fontSize: 18, minHeight: 44 }} />
              </div>
            </AuthForm>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
              <form action={resendEmailChange} style={{ margin: 0 }}>
                <button className="btn btn-ghost" type="submit" style={{ padding: 0, fontSize: 13 }}>
                  Send a new code
                </button>
              </form>
              <form action={cancelEmailChange} style={{ margin: 0 }}>
                <button className="btn btn-ghost" type="submit" style={{ padding: 0, fontSize: 13 }}>
                  Use a different address, or keep the current one
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ margin: 0 }}>Move your account to a new address</h3>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              You sign in with <span style={{ color: "var(--color-text)" }}>{user.email}</span> now. We'll send
              a code to the new address to make sure it's yours, and let the current one know.
            </p>
            <AuthForm action={requestEmailChange} submitLabel="Send code">
              <div className="field">
                <label htmlFor="email">New email</label>
                <input className="input" id="email" name="email" type="email" placeholder="you@example.com"
                  autoComplete="email" required />
              </div>
              <div className="field">
                <label htmlFor="password">Current password</label>
                <PasswordInput id="password" name="password" required autoComplete="current-password" />
              </div>
            </AuthForm>
          </>
        )}
        <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
          No SMTP configured? The code is printed in the server console.
        </p>
        <div className="text-muted" style={{ fontSize: 13 }}>
          <Link href="/profile">Back to your profile</Link>
        </div>
      </div>
    </div>
  );
}
