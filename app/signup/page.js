import { redirect } from "next/navigation";

// The signup screen lives at "/" so the site root answers 200 for health checks.
// This path is kept as an alias for anyone holding an older link.
export default function SignupAlias() {
  redirect("/");
}
