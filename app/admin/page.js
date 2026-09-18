import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import UserActions from "./UserActions";
import { currentUser, isAdminUser } from "@/lib/session";
import { db } from "@/lib/db";
import { fmt } from "@/lib/format";

export default async function Admin({ searchParams }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!isAdminUser(user)) redirect("/trips");

  const { q = "" } = await searchParams;
  const query = String(q || "").trim();

  const users = await db.user.findMany({
    where: query
      ? { OR: [
          { email: { contains: query } },
          { handle: { contains: query } },
          { name: { contains: query } }
        ] }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { trips: true } } }
  });

  return (
    <>
      <Nav user={user} active="admin" />
      <div className="page-shell" style={{ paddingTop: 34 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: "0 0 4px" }}>Users</h2>
            <div className="text-muted" style={{ fontSize: 13 }}>
              {users.length} {query ? "matching “" + query + "”" : "total"}
            </div>
          </div>
          <form style={{ display: "flex", gap: 8 }}>
            <input className="input" name="q" defaultValue={query} placeholder="Search email, handle, name…" style={{ width: 260 }} />
            <button className="btn btn-secondary" type="submit">Search</button>
          </form>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Trips</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center",
                        fontSize: 11, background: "var(--color-accent-800)", color: "var(--color-accent-100)", flexShrink: 0
                      }}>
                        {u.avatarUrl
                          ? <img src={u.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : (u.name || u.email || "?").slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div style={{ fontWeight: 500 }}>{u.name || u.handle}</div>
                        <div className="text-muted" style={{ fontSize: 12 }}>@{u.handle}</div>
                      </div>
                    </div>
                  </td>
                  <td>{u.email}</td>
                  <td>{u._count.trips}</td>
                  <td className="text-muted">{fmt(u.createdAt)}</td>
                  <td>
                    <UserActions userId={u.id} verified={u.verified} isAdmin={u.isAdmin} isSelf={u.id === user.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="text-muted" style={{ fontSize: 14, marginTop: 20 }}>No users match that search.</p>
          )}
        </div>
      </div>
    </>
  );
}
