import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import Field from "@/components/Field";
import AvatarUpload from "./AvatarUpload";
import HandleField from "./HandleField";
import { currentUser } from "@/lib/session";
import { updateProfile } from "@/app/actions";
import { fmt } from "@/lib/format";

export default async function Profile() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!user.verified) redirect("/verify?email=" + encodeURIComponent(user.email));

  const initials = (user.name || user.email || "me").slice(0, 2).toUpperCase();

  return (
    <>
      <Nav user={user} active="profile" />
      <div className="page-shell" style={{ maxWidth: 640, paddingTop: 34 }}>
        <h2 style={{ margin: "0 0 4px" }}>Your profile</h2>
        <p className="text-muted" style={{ fontSize: 13, margin: "0 0 26px" }}>
          Member since {fmt(user.createdAt)}
        </p>

        <div className="card elev-sm" style={{ padding: 24, gap: 20 }}>
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <AvatarUpload avatarUrl={user.avatarUrl} initials={initials} />
            <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="field">
                <label>Display name</label>
                <Field value={user.name} placeholder="What should we call you?"
                  save={updateProfile.bind(null, "name")} />
              </div>
              <HandleField handle={user.handle} />
            </div>
          </div>

          <div style={{ height: 1, background: "var(--color-divider)" }} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            <div className="field">
              <label>Home city</label>
              <Field value={user.homeCity} placeholder="Where do you live?"
                save={updateProfile.bind(null, "homeCity")} />
            </div>
            <div className="field">
              <label>Favorite vacation place</label>
              <Field value={user.favoritePlace} placeholder="Where do you always want to go back to?"
                save={updateProfile.bind(null, "favoritePlace")} />
            </div>
          </div>

          <div className="field">
            <label>About</label>
            <Field as="textarea" value={user.bio} placeholder="A little about you and how you travel…"
              save={updateProfile.bind(null, "bio")} rows={4} />
          </div>

          <div style={{ height: 1, background: "var(--color-divider)" }} />

          <div className="field">
            <label>Email</label>
            <input className="input" value={user.email} disabled style={{ opacity: 0.6 }} />
            <p className="text-muted" style={{ fontSize: 11, margin: "4px 0 0" }}>
              Contact support to change the email on your account.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
