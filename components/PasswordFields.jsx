"use client";

import { useRef } from "react";
import PasswordInput from "./PasswordInput";

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
        <PasswordInput ref={password} id="password" name="password"
          placeholder="At least 10 characters" required minLength={10} autoComplete="new-password" onInput={check} />
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">Confirm {label.toLowerCase()}</label>
        <PasswordInput ref={confirm} id="confirmPassword" name="confirmPassword"
          placeholder="Type it again" required minLength={10} autoComplete="new-password" onInput={check} />
      </div>
    </>
  );
}
