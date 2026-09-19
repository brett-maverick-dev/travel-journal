import { redirect } from "next/navigation";
import Link from "next/link";
import Nav from "@/components/Nav";
import BackupActions from "../BackupActions";
import { currentUser, isAdminUser } from "@/lib/session";
import { listBackups } from "@/lib/backup";

function fmtBytes(n) {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

function fmtWhen(d) {
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
  });
}

const KEEP_NOTE = "14 kept";

export default async function AdminBackups() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  if (!isAdminUser(user)) redirect("/trips");

  const backups = await listBackups();

  return (
    <>
      <Nav user={user} active="admin" />
      <div className="page-shell" style={{ paddingTop: 34 }}>
        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          <Link href="/admin" className="text-muted">Users</Link>
          <Link href="/admin/backups">Backups</Link>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: "0 0 4px" }}>Database backups</h2>
            <div className="text-muted" style={{ fontSize: 13 }}>
              {backups.length} snapshot{backups.length === 1 ? "" : "s"} · taken automatically on every boot and daily, newest {KEEP_NOTE}
            </div>
          </div>
          <BackupActions />
        </div>

        {backups.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 14 }}>No backups yet — one gets taken the next time the app boots, or click the button above.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.name}>
                  <td>{b.name}</td>
                  <td className="text-muted">{fmtBytes(b.size)}</td>
                  <td className="text-muted">{fmtWhen(b.mtime)}</td>
                  <td>
                    <a className="btn btn-secondary" href={"/api/admin/backup?f=" + encodeURIComponent(b.name)}>
                      <i className="ph ph-download-simple" />Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
