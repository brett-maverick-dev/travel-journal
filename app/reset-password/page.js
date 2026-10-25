import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import PasswordFields from "@/components/PasswordFields";
import { resetPassword } from "@/app/actions";

export default async function ResetPassword({ searchParams }) {
  const { email = "", restored } = await searchParams;
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 40 }}>
      <div className="card elev-sm" style={{ width: "min(420px, 100%)", padding: 26, gap: 12 }}>
        <div className="card-kicker">Reset password</div>
        <h3 style={{ margin: 0 }}>{restored ? "Your account is back" : "Check your email"}</h3>
        {restored ? (
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            It uses <span style={{ color: "var(--color-text)" }}>{email}</span> again, and everyone has been
            signed out. The old password no longer works — we sent a code to that address so you can choose a
            new one. It expires in ten minutes.
          </p>
        ) : (
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            If <span style={{ color: "var(--color-text)" }}>{email}</span> has an account, we sent it a
            reset code. It expires in ten minutes.
          </p>
        )}
        <AuthForm action={resetPassword} submitLabel="Reset password">
          <input type="hidden" name="email" value={email} />
          <div className="field">
            <label htmlFor="code">Reset code</label>
            <input className="input" id="code" name="code" inputMode="numeric" autoComplete="one-time-code"
              placeholder="······" required
              style={{ letterSpacing: "0.5em", fontSize: 18, minHeight: 44 }} />
          </div>
          <PasswordFields label="New password" />
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
