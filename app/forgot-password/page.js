import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { requestPasswordReset } from "@/app/actions";

export default function ForgotPassword() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 40 }}>
      <div style={{ width: "min(380px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--color-accent)", boxShadow: "0 0 12px var(--color-accent)" }} />
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 17 }}>Meridian</span>
        </div>
        <h2 style={{ margin: "0 0 8px" }}>Reset your password</h2>
        <p className="text-muted" style={{ fontSize: 13, margin: "0 0 20px" }}>
          Enter your email and we'll send a code to reset it.
        </p>
        <AuthForm action={requestPasswordReset} submitLabel="Send code">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required />
          </div>
        </AuthForm>
        <div className="text-muted" style={{ fontSize: 13, marginTop: 14 }}>
          <Link href="/signin">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
