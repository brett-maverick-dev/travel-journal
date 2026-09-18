import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { resetPassword } from "@/app/actions";

export default async function ResetPassword({ searchParams }) {
  const { email = "" } = await searchParams;
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 40 }}>
      <div className="card elev-sm" style={{ width: "min(420px, 100%)", padding: 26, gap: 12 }}>
        <div className="card-kicker">Reset password</div>
        <h3 style={{ margin: 0 }}>Check your email</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          If <span style={{ color: "var(--color-text)" }}>{email}</span> has an account, we sent it a
          reset code. It expires in ten minutes.
        </p>
        <AuthForm action={resetPassword} submitLabel="Reset password">
          <input type="hidden" name="email" value={email} />
          <div className="field">
            <label htmlFor="code">Reset code</label>
            <input className="input" id="code" name="code" inputMode="numeric" autoComplete="one-time-code"
              placeholder="······" required
              style={{ letterSpacing: "0.5em", fontSize: 18, minHeight: 44 }} />
          </div>
          <div className="field">
            <label htmlFor="password">New password</label>
            <input className="input" id="password" name="password" type="password" required minLength={10}
              placeholder="At least 10 characters" />
          </div>
        </AuthForm>
        <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
          No SMTP configured? The code is printed in the server console.
        </p>
        <div className="text-muted" style={{ fontSize: 13 }}>
          <Link href="/forgot-password">Send another code</Link> · <Link href="/signin">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
