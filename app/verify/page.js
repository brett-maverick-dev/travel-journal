import AuthForm from "@/components/AuthForm";
import { verifyEmail, resendVerification } from "@/app/actions";

export default async function Verify({ searchParams }) {
  const { email = "", sent } = await searchParams;
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 40 }}>
      <div className="card elev-sm" style={{ width: "min(420px, 100%)", padding: 26, gap: 12 }}>
        <div className="card-kicker">Step 2 of 2</div>
        <h3 style={{ margin: 0 }}>Check your email</h3>
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          {sent ? "We sent a new code to " : "We sent a code to "}
          <span style={{ color: "var(--color-text)" }}>{email}</span>. It expires in ten minutes.
        </p>
        <AuthForm action={verifyEmail} submitLabel="Verify and continue">
          <input type="hidden" name="email" value={email} />
          <div className="field">
            <label htmlFor="code">Confirmation code</label>
            <input className="input" id="code" name="code" inputMode="numeric" autoComplete="one-time-code"
              placeholder="······" required
              style={{ letterSpacing: "0.5em", fontSize: 18, minHeight: 44 }} />
          </div>
        </AuthForm>
        <form action={resendVerification} style={{ margin: 0 }}>
          <input type="hidden" name="email" value={email} />
          <button className="btn btn-ghost" type="submit" style={{ padding: 0, fontSize: 13 }}>
            Didn't get it, or it expired? Send a new code
          </button>
        </form>
        <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
          No SMTP configured? The code is printed in the server console.
        </p>
      </div>
    </div>
  );
}
