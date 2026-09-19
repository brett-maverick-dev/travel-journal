import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import { signIn } from "@/app/actions";

export default function SignIn() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 40 }}>
      <div style={{ width: "min(380px, 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--color-accent)", boxShadow: "0 0 12px var(--color-accent)" }} />
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: 17 }}>Trekkster</span>
        </div>
        <h2 style={{ margin: "0 0 20px" }}>Welcome back</h2>
        <AuthForm action={signIn} submitLabel="Sign in">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" required />
          </div>
        </AuthForm>
        <div className="text-muted" style={{ fontSize: 13, marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>New here? <Link href="/signup">Create an account</Link></span>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </div>
    </div>
  );
}
