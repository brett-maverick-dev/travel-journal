"use client";

import { useState } from "react";

// A password box with an eye button that shows what's been typed. The button
// is type="button" so it never submits the form, and it keeps focus in the
// input so the cursor stays where it was.
export default function PasswordInput({ ref, className = "input", ...props }) {
  const [shown, setShown] = useState(false);
  const label = shown ? "Hide password" : "Show password";

  return (
    <div className="password-input">
      <input ref={ref} className={className} type={shown ? "text" : "password"}
        autoCapitalize="off" autoCorrect="off" spellCheck={false} {...props} />
      <button type="button" className="btn btn-icon password-toggle" aria-label={label} title={label}
        aria-pressed={shown} onMouseDown={(e) => e.preventDefault()} onClick={() => setShown((s) => !s)}>
        <i className={shown ? "ph ph-eye-slash" : "ph ph-eye"} />
      </button>
    </div>
  );
}
