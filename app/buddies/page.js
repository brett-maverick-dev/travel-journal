import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import UserRow from "./UserRow";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { searchUsers, normalizeQuery } from "@/lib/user-search";
import { suggestBuddies, mutualLabel } from "@/lib/buddy-suggestions";

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <h6 className="text-muted" style={{ margin: "0 0 10px" }}>{title}</h6>
      <div className="card elev-sm" style={{ padding: "2px 20px" }}>{children}</div>
    </div>
  );
}

export default async function Buddies({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!user.verified) redirect("/verify?email=" + encodeURIComponent(user.email));

  const { q = "" } = await searchParams;
  const query = String(q || "").trim();

  const rows = await db.buddy.findMany({
    where: { OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
    include: { requester: true, addressee: true },
    orderBy: { createdAt: "desc" }
  });
  const other = (row) => (row.requesterId === user.id ? row.addressee : row.requester);

  const buddies = rows.filter((r) => r.status === "ACCEPTED");
  const incoming = rows.filter((r) => r.status === "PENDING" && r.addresseeId === user.id);
  const outgoing = rows.filter((r) => r.status === "PENDING" && r.requesterId === user.id);
  const blocked = rows.filter((r) => r.status === "BLOCKED" && r.requesterId === user.id);

  const relation = new Map();
  for (const r of rows) relation.set(other(r).id, r);

  const results = query ? await searchUsers(query, user.id) : [];
  const suggestions = await suggestBuddies(user.id);
  const tooShort = query && results.length === 0 && normalizeQuery(query).term.length < 2 && !normalizeQuery(query).email;

  return (
    <>
      <Nav user={user} active="buddies" />
      <div className="page-shell" style={{ paddingTop: 34, maxWidth: 720 }}>
        <h2 style={{ margin: "0 0 4px" }}>Travel Buddies</h2>
        <p className="text-muted" style={{ fontSize: 13, margin: "0 0 26px" }}>
          {buddies.length} {buddies.length === 1 ? "buddy" : "buddies"}
        </p>

        <div className="card elev-sm" style={{ padding: 20, gap: 12, marginBottom: 26 }}>
          <h6 className="text-muted" style={{ margin: 0 }}>Find a travel buddy</h6>
          <form style={{ display: "flex", gap: 8 }}>
            <input className="input" name="q" type="search" defaultValue={query} style={{ flex: 1 }}
              placeholder="Name, @username, social handle or email address" aria-label="Search for people" />
            <button className="btn btn-secondary" type="submit">Search</button>
          </form>
          <p className="text-muted" style={{ fontSize: 11, margin: 0 }}>
            Paste a profile link to search by its handle. Email addresses have to match exactly.
          </p>
          {tooShort && (
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>Type at least 2 characters.</p>
          )}
          {query && !tooShort && results.length === 0 && (
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>No one matches "{query}".</p>
          )}
          {results.map(({ user: u, matchedBy }) => (
            <UserRow key={u.id} user={u} relation={relation.get(u.id)} me={user.id} hint={matchedBy && "Matched " + matchedBy} />
          ))}
        </div>

        {incoming.length > 0 && (
          <Section title={"Requests (" + incoming.length + ")"}>
            {incoming.map((r) => <UserRow key={r.id} user={other(r)} relation={r} me={user.id} />)}
          </Section>
        )}

        {suggestions.length > 0 && (
          <Section title="People you may know">
            {suggestions.map(({ user: u, mutual }) => (
              <UserRow key={u.id} user={u} relation={null} me={user.id} hint={mutualLabel(mutual)} />
            ))}
          </Section>
        )}

        <Section title="Your buddies">
          {buddies.length === 0
            ? <p className="text-muted" style={{ fontSize: 14, padding: "10px 0" }}>No travel buddies yet — search above to add one.</p>
            : buddies.map((r) => <UserRow key={r.id} user={other(r)} relation={r} me={user.id} />)}
        </Section>

        {outgoing.length > 0 && (
          <Section title="Sent">
            {outgoing.map((r) => <UserRow key={r.id} user={other(r)} relation={r} me={user.id} />)}
          </Section>
        )}

        {blocked.length > 0 && (
          <Section title="Blocked">
            {blocked.map((r) => <UserRow key={r.id} user={other(r)} relation={r} me={user.id} />)}
          </Section>
        )}
      </div>
    </>
  );
}
