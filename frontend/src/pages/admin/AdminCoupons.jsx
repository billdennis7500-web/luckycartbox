import React, { useEffect, useState } from "react";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import LoadMore from "@/components/LoadMore";

const empty = { code: "", amount: 500, max_uses: 1, active: true };

export default function AdminCoupons() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [visible, setVisible] = useState(15);

  const load = () => api.get("/admin/coupons").then((r) => { setItems(r.data); setVisible(15); });
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = { ...editing, amount: Number(editing.amount), max_uses: Number(editing.max_uses) };
      if (editing.id) await api.put(`/admin/coupons/${editing.id}`, payload);
      else await api.post("/admin/coupons", payload);
      toast.success("Saved");
      setEditing(null); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.code}?`)) return;
    await api.delete(`/admin/coupons/${c.id}`); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-coupons-heading">Coupons</h1>
          <p className="text-[var(--nb-muted)] mt-2">Create bonus codes for users to redeem.</p>
        </div>
        <Button onClick={() => setEditing(empty)} data-testid="admin-add-coupon-btn"
                className="bg-[#0055FF] hover:bg-[#3377FF]"><Plus className="w-4 h-4 mr-1"/>New coupon</Button>
      </div>

      <Card className="bg-[var(--nb-card)] border-[var(--nb-border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[var(--nb-muted)] bg-[var(--nb-card2)]">
            <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Uses</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--nb-border)]">
            {items.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-[var(--nb-muted)]" data-testid="no-coupons">No coupons.</td></tr>}
            {items.slice(0, visible).map((c) => (
              <tr key={c.id} data-testid={`coupon-row-${c.id}`}>
                <td className="px-4 py-3"><code className="text-[#0055FF] font-display font-600">{c.code}</code></td>
                <td className="px-4 py-3 tabular">{formatNaira(c.amount)}</td>
                <td className="px-4 py-3 tabular">{c.used_count} / {c.max_uses}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${c.active ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30" : "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30"}`}>
                    {c.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(c)} data-testid={`edit-coupon-${c.id}`}
                          className="border-[var(--nb-border)] bg-transparent text-white"><Pencil className="w-3 h-3"/></Button>
                  <Button size="sm" variant="outline" onClick={() => remove(c)} data-testid={`delete-coupon-${c.id}`}
                          className="border-[#EF4444]/40 bg-transparent text-[#EF4444] hover:bg-[#EF4444]/10"><Trash2 className="w-3 h-3"/></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <LoadMore shown={Math.min(visible, items.length)} total={items.length} onMore={setVisible} step={15} testid="load-more-admin-coupons" />
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-[var(--nb-card)] border-[var(--nb-border)] text-white">
          <DialogHeader><DialogTitle className="font-display">{editing?.id ? "Edit coupon" : "New coupon"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Code</Label>
                <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                       data-testid="coupon-code-input-admin"
                       className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11 uppercase tracking-widest" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount (₦)</Label>
                  <Input type="number" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                         data-testid="coupon-amount-input"
                         className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
                </div>
                <div>
                  <Label>Max uses</Label>
                  <Input type="number" value={editing.max_uses} onChange={(e) => setEditing({ ...editing, max_uses: e.target.value })}
                         data-testid="coupon-uses-input"
                         className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} data-testid="coupon-active-switch"/>
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-[var(--nb-border)] bg-transparent text-white" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} data-testid="coupon-save-btn" className="bg-[#0055FF] hover:bg-[#3377FF]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
