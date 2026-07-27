import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import LoadMore from "@/components/LoadMore";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(15);

  const load = () => api.get("/admin/users", { params: q ? { q } : {} }).then((r) => { setUsers(r.data); setVisible(15); });
  useEffect(() => { load(); }, [q]); // eslint-disable-line

  const addBalance = async () => {
    setSaving(true);
    try {
      await api.post(`/admin/users/${target.id}/add-balance`, { amount: Number(amount), note });
      toast.success(`Credited ${formatNaira(amount)} to ${target.name}`);
      setTarget(null); setAmount(""); setNote("");
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-users-heading">Users</h1>
          <p className="text-[#94A3B8] mt-2">Search users, credit balances, drill into details.</p>
        </div>
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3 top-3.5 text-[#94A3B8]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone"
                 data-testid="user-search-input"
                 className="pl-9 bg-[#121E30] border-[#1A2B44] text-white h-11" />
        </div>
      </div>

      <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
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
          <tbody className="divide-y divide-[#1A2B44]">
            {users.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-[#94A3B8]" data-testid="no-users">No users found.</td></tr>}
            {users.slice(0, visible).map((u) => (
              <tr key={u.id} data-testid={`user-row-${u.id}`}>
                <td className="px-4 py-3"><Link to={`/admin/users/${u.id}`} className="hover:text-[#0055FF]">{u.name}</Link></td>
                <td className="px-4 py-3 text-[#94A3B8]">{u.phone}</td>
                <td className="px-4 py-3"><code className="text-xs text-[#0055FF]">{u.referral_code}</code></td>
                <td className="px-4 py-3 tabular font-display font-600">{formatNaira(u.wallet_balance)}</td>
                <td className="px-4 py-3 tabular text-[#94A3B8]">{formatNaira(u.total_invested)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${u.has_invested ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30" : "bg-[#1A2B44] text-[#94A3B8]"}`}>
                    {u.has_invested ? "Active" : "Pending"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" onClick={() => setTarget(u)} data-testid={`add-balance-btn-${u.id}`}
                          className="bg-[#0055FF] hover:bg-[#3377FF]"><Wallet className="w-3 h-3 mr-1"/>Add balance</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <LoadMore shown={Math.min(visible, users.length)} total={users.length} onMore={setVisible} step={15} testid="load-more-users" />
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="bg-[#0B1524] border-[#1A2B44] text-white">
          <DialogHeader>
            <DialogTitle className="font-display">Credit wallet · {target?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-[#94A3B8]">
              Current: <span className="text-white tabular">{formatNaira(target?.wallet_balance)}</span>
            </div>
            <div>
              <Label>Amount (₦) — negative to debit</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                     data-testid="admin-add-amount-input"
                     className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
            </div>
            <div>
              <Label>Note</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Admin credit"
                     data-testid="admin-add-note-input"
                     className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-[#1A2B44] bg-transparent text-white" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={addBalance} disabled={saving} data-testid="admin-add-balance-confirm"
                    className="bg-[#0055FF] hover:bg-[#3377FF]">{saving ? "Saving…" : "Credit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
