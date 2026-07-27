import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Eye, Users2, Filter } from "lucide-react";
import LoadMore from "@/components/LoadMore";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [visible, setVisible] = useState(20);
  const [onlyFunded, setOnlyFunded] = useState(false);

  const load = () => api.get("/admin/users", { params: q ? { q } : {} }).then((r) => { setUsers(r.data); setVisible(20); });
  useEffect(() => { load(); }, [q]); // eslint-disable-line

  const activeCount = users.filter((u) => u.has_invested).length;
  const fundedCount = useMemo(() => users.filter((u) => (u.total_admin_credited || 0) > 0).length, [users]);
  const shown = useMemo(
    () => (onlyFunded ? users.filter((u) => (u.total_admin_credited || 0) > 0) : users),
    [users, onlyFunded]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-users-heading">Users</h1>
          <p className="text-[var(--nb-muted)] mt-2">Search users, open a live mirror of any account, and credit or debit their wallet.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-[var(--nb-border)] bg-[var(--nb-card)] px-3 py-2 text-xs" data-testid="stat-investors">
            <span className="text-[var(--nb-muted)]">Investors: </span>
            <span className="font-display font-800 text-[#10B981] tabular">{activeCount}</span>
            <span className="text-[var(--nb-muted)]"> / {users.length}</span>
          </div>
          <div className="rounded-lg border border-[var(--nb-border)] bg-[var(--nb-card)] px-3 py-2 text-xs" data-testid="stat-funded">
            <span className="text-[var(--nb-muted)]">Funded by admin: </span>
            <span className="font-display font-800 text-[#F59E0B] tabular">{fundedCount}</span>
          </div>
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-3.5 text-[var(--nb-muted)]" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone"
                   data-testid="user-search-input"
                   className="pl-9 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOnlyFunded((v) => !v)}
          data-testid="filter-funded-toggle"
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border transition-colors ${
            onlyFunded
              ? "bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/40"
              : "border-[var(--nb-border)] text-[var(--nb-muted)] hover:text-white"
          }`}
        >
          <Filter className="w-3 h-3" /> Only admin-funded {onlyFunded ? "· ON" : ""}
        </button>
      </div>

      <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[var(--nb-muted)] bg-[var(--nb-card2)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Ref code</th>
              <th className="px-4 py-3">Wallet</th>
              <th className="px-4 py-3">Invested</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--nb-border)]">
            {shown.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-[var(--nb-muted)]" data-testid="no-users">
                <Users2 className="w-6 h-6 text-[#0055FF] mx-auto mb-2" />
                {onlyFunded ? "No users have been funded by admin yet." : "No users found."}
              </td></tr>
            )}
            {shown.slice(0, visible).map((u) => {
              const funded = (u.total_admin_credited || 0) > 0;
              return (
                <tr key={u.id} data-testid={`user-row-${u.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link to={`/admin/users/${u.id}`} data-testid={`view-user-link-${u.id}`}
                            className="hover:text-[#0055FF] font-display font-600">
                        {u.name}
                      </Link>
                      {funded && (
                        <span data-testid={`funded-badge-${u.id}`}
                              className="text-[10px] px-1.5 py-0.5 rounded-full border bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30"
                              title={`Admin-credited ${formatNaira(u.total_admin_credited)}`}>
                          Admin-funded
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--nb-muted)] tabular">{u.phone}</td>
                  <td className="px-4 py-3"><code className="text-xs text-[#0055FF]">{u.referral_code}</code></td>
                  <td className="px-4 py-3 tabular font-display font-600">{formatNaira(u.wallet_balance)}</td>
                  <td className="px-4 py-3 tabular text-[var(--nb-muted)]">{formatNaira(u.total_invested)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      u.has_invested
                        ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
                        : "bg-[var(--nb-border)] text-[var(--nb-muted)]"
                    }`}>
                      {u.has_invested ? "Investor" : "Signed up"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/admin/users/${u.id}`}>
                      <Button size="sm" data-testid={`open-user-${u.id}`}
                              className="bg-[#0055FF] hover:bg-[#3377FF]">
                        <Eye className="w-3 h-3 mr-1"/>View
                      </Button>
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <LoadMore shown={Math.min(visible, shown.length)} total={shown.length} onMore={setVisible} step={20} testid="load-more-users" />
      </Card>
    </div>
  );
}
