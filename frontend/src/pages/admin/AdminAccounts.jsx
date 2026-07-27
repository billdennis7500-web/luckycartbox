import React, { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Landmark } from "lucide-react";

const empty = { bank_name: "", account_name: "", account_number: "", active: true };

export default function AdminAccounts() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/admin/payment-accounts").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editing.id) await api.put(`/admin/payment-accounts/${editing.id}`, editing);
      else await api.post("/admin/payment-accounts", editing);
      toast.success("Saved"); setEditing(null); load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
  };
  const remove = async (a) => {
    if (!window.confirm(`Delete ${a.bank_name}?`)) return;
    await api.delete(`/admin/payment-accounts/${a.id}`); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-accounts-heading">Payment accounts</h1>
          <p className="text-[#94A3B8] mt-2">Add multiple bank accounts users can deposit into.</p>
        </div>
        <Button onClick={() => setEditing(empty)} data-testid="admin-add-account-btn"
                className="bg-[#0055FF] hover:bg-[#3377FF]"><Plus className="w-4 h-4 mr-1"/>Add account</Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.length === 0 && <div className="col-span-full text-center py-10 text-[#94A3B8]" data-testid="no-accounts">No payment accounts yet.</div>}
        {items.map((a) => (
          <Card key={a.id} className="bg-[#0B1524] border-[#1A2B44] p-5 rounded-xl" data-testid={`account-card-${a.id}`}>
            <div className="flex items-start justify-between">
              <Landmark className="w-8 h-8 text-[#0055FF]" />
              <span className={`text-xs px-2 py-0.5 rounded-full border ${a.active ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30" : "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30"}`}>
                {a.active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="mt-3 font-display font-600">{a.bank_name}</div>
            <div className="text-sm text-[#94A3B8]">{a.account_name}</div>
            <div className="mt-2 tabular text-lg font-display font-600">{a.account_number}</div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(a)} data-testid={`edit-account-${a.id}`}
                      className="border-[#1A2B44] bg-transparent text-white"><Pencil className="w-3 h-3 mr-1"/>Edit</Button>
              <Button size="sm" variant="outline" onClick={() => remove(a)} data-testid={`delete-account-${a.id}`}
                      className="border-[#EF4444]/40 bg-transparent text-[#EF4444] hover:bg-[#EF4444]/10"><Trash2 className="w-3 h-3 mr-1"/>Delete</Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-[#0B1524] border-[#1A2B44] text-white">
          <DialogHeader><DialogTitle className="font-display">{editing?.id ? "Edit account" : "Add account"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Bank name</Label>
                <Input value={editing.bank_name} onChange={(e) => setEditing({ ...editing, bank_name: e.target.value })}
                       data-testid="acct-bank-input"
                       className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
              </div>
              <div>
                <Label>Account name</Label>
                <Input value={editing.account_name} onChange={(e) => setEditing({ ...editing, account_name: e.target.value })}
                       data-testid="acct-name-input"
                       className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
              </div>
              <div>
                <Label>Account number</Label>
                <Input value={editing.account_number} onChange={(e) => setEditing({ ...editing, account_number: e.target.value })}
                       data-testid="acct-number-input"
                       className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11 tabular" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} data-testid="acct-active-switch" />
                <Label>Active (visible to users)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-[#1A2B44] bg-transparent text-white" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} data-testid="acct-save-btn" className="bg-[#0055FF] hover:bg-[#3377FF]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
