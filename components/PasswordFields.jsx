"use client";

import { useRef } from "react";

// A new password and its confirmation. While they differ the confirm box is
// marked invalid, so the browser stops the form from submitting — and nothing
// typed so far is lost. The server action checks the two match as well.
export default function PasswordFields({ label = "Password" }) {
  const password = useRef(null);
  const confirm = useRef(null);
  const check = () => {
    const el = confirm.current;
    if (!el) return;
    el.setCustomValidity(el.value && el.value !== password.current.value ? "The passwords don't match." : "");
  };

  return (
    <>
      <div className="field">
        <label htmlFor="password">{label}</label>
        <input ref={password} className="input" id="password" name="password" type="password"
          placeholder="At least 10 characters" required minLength={10} autoComplete="new-password" onInput={check} />
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">Confirm {label.toLowerCase()}</label>
        <input ref={confirm} className="input" id="confirmPassword" name="confirmPassword" type="password"
          placeholder="Type it again" required minLength={10} autoComplete="new-password" onInput={check} />
      </div>
    </>
  );
}
