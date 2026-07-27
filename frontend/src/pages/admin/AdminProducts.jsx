import React, { useEffect, useState } from "react";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import LoadMore from "@/components/LoadMore";

const empty = { name: "", price: 5000, daily_profit_pct: 5, duration_days: 30, description: "", active: true };

export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [visible, setVisible] = useState(9);

  const load = () => api.get("/products").then((r) => { setItems(r.data); setVisible(9); });
  useEffect(() => { load(); }, []);

  const save = async () => {
    const payload = { ...editing, price: Number(editing.price), daily_profit_pct: Number(editing.daily_profit_pct), duration_days: Number(editing.duration_days) };
    try {
      if (editing.id) await api.put(`/admin/products/${editing.id}`, payload);
      else await api.post("/admin/products", payload);
      toast.success("Saved");
      setEditing(null); load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };
  const remove = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    await api.delete(`/admin/products/${p.id}`);
    toast.success("Deleted"); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-products-heading">Products</h1>
          <p className="text-[#94A3B8] mt-2">Add and manage investment plans.</p>
        </div>
        <Button onClick={() => setEditing(empty)} data-testid="admin-add-product-btn"
                className="bg-[#0055FF] hover:bg-[#3377FF]"><Plus className="w-4 h-4 mr-1" /> Add product</Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.slice(0, visible).map((p) => (
          <Card key={p.id} className="bg-[#0B1524] border-[#1A2B44] p-5 rounded-xl" data-testid={`admin-product-${p.id}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display font-600">{p.name}</div>
                <div className="text-xs text-[#94A3B8] mt-1">{p.description}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${p.active ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30" : "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30"}`}>
                {p.active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div className="border border-[#1A2B44] rounded p-2">
                <div className="text-[#94A3B8]">Price</div>
                <div className="tabular">{formatNaira(p.price)}</div>
              </div>
              <div className="border border-[#1A2B44] rounded p-2">
                <div className="text-[#94A3B8]">Daily</div>
                <div className="tabular">{p.daily_profit_pct}%</div>
              </div>
              <div className="border border-[#1A2B44] rounded p-2">
                <div className="text-[#94A3B8]">Days</div>
                <div className="tabular">{p.duration_days}</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(p)} data-testid={`edit-product-${p.id}`}
                      className="border-[#1A2B44] bg-transparent text-white"><Pencil className="w-3 h-3 mr-1"/>Edit</Button>
              <Button size="sm" variant="outline" onClick={() => remove(p)} data-testid={`delete-product-${p.id}`}
                      className="border-[#EF4444]/40 bg-transparent text-[#EF4444] hover:bg-[#EF4444]/10"><Trash2 className="w-3 h-3 mr-1"/>Delete</Button>
            </div>
          </Card>
        ))}
      </div>
      <LoadMore shown={Math.min(visible, items.length)} total={items.length} onMore={setVisible} step={9} testid="load-more-admin-products" />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-[#0B1524] border-[#1A2B44] text-white max-w-lg">
          <DialogHeader><DialogTitle className="font-display">{editing?.id ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                       data-testid="prod-name-input"
                       className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Price</Label>
                  <Input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                         data-testid="prod-price-input"
                         className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
                </div>
                <div>
                  <Label>Daily %</Label>
                  <Input type="number" step="0.1" value={editing.daily_profit_pct} onChange={(e) => setEditing({ ...editing, daily_profit_pct: e.target.value })}
                         data-testid="prod-daily-input"
                         className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
                </div>
                <div>
                  <Label>Days</Label>
                  <Input type="number" value={editing.duration_days} onChange={(e) => setEditing({ ...editing, duration_days: e.target.value })}
                         data-testid="prod-days-input"
                         className="mt-2 bg-[#121E30] border-[#1A2B44] text-white h-11" />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                          data-testid="prod-desc-input"
                          className="mt-2 bg-[#121E30] border-[#1A2B44] text-white" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} data-testid="prod-active-switch" />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-[#1A2B44] bg-transparent text-white" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} data-testid="prod-save-btn" className="bg-[#0055FF] hover:bg-[#3377FF]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
