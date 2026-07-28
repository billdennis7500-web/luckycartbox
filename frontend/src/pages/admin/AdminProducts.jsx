import React, { useEffect, useRef, useState } from "react";
import { api, formatNaira, formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import LoadMore from "@/components/LoadMore";

const empty = {
  name: "", price: 5000, daily_profit_pct: 5, duration_days: 30,
  description: "", active: true, image_url: "", tier: "",
};

const TIER_OPTIONS = [
  { key: "",          label: "Auto (by daily %)" },
  { key: "legendary", label: "Legendary" },
  { key: "epic",      label: "Epic" },
  { key: "hot",       label: "Hot" },
  { key: "newcomer",  label: "Newcomer" },
  { key: "tech",      label: "Tech" },
  { key: "fashion",   label: "Fashion" },
];

/* Maximum edge (px) we allow for uploaded product images. Anything larger is
 * proportionally scaled down before base64-encoding so we don't bloat MongoDB. */
const MAX_IMAGE_EDGE = 640;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;   // 8 MB raw upload limit

async function fileToCompressedDataUrl(file) {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("File is larger than 8 MB.");
  const rawUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
  // Draw on a canvas and re-encode as JPEG at 0.82 quality — small enough for
  // MongoDB while keeping product photos crisp.
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
        const scale = MAX_IMAGE_EDGE / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      // Use PNG if the source is PNG and small, else JPEG for compression
      const isPng = file.type === "image/png" && file.size < 512 * 1024;
      const dataUrl = canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.82);
      res(dataUrl);
    };
    img.onerror = () => rej(new Error("Invalid image"));
    img.src = rawUrl;
  });
}

export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [visible, setVisible] = useState(9);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = () => api.get("/products").then((r) => { setItems(r.data); setVisible(9); });
  useEffect(() => { load(); }, []);

  const save = async () => {
    const payload = {
      ...editing,
      price: Number(editing.price),
      daily_profit_pct: Number(editing.daily_profit_pct),
      duration_days: Number(editing.duration_days),
      // Empty string → null so backend stores nothing (image_url is Optional)
      image_url: editing.image_url || null,
      tier: editing.tier || null,
    };
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

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file (PNG, JPG, WebP)");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setEditing((s) => ({ ...s, image_url: dataUrl }));
      toast.success("Image ready — click Save to attach");
    } catch (err) {
      toast.error(err.message || "Image upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="admin-products-heading">Products</h1>
          <p className="text-[var(--nb-muted)] mt-2">Add and manage investment plans. Upload a product photo to make each plan pop.</p>
        </div>
        <Button onClick={() => setEditing(empty)} data-testid="admin-add-product-btn"
                className="bg-[#0055FF] hover:bg-[#3377FF]"><Plus className="w-4 h-4 mr-1" /> Add product</Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.slice(0, visible).map((p) => (
          <Card
            key={p.id}
            className="bg-[var(--nb-card)] border-[var(--nb-border)] p-4 rounded-xl"
            data-testid={`admin-product-${p.id}`}
          >
            {/* Compact preview: image left, info right */}
            <div className="flex gap-3">
              <div data-nb-image="dark" className="w-20 h-20 shrink-0 rounded-lg grid place-items-center overflow-hidden"
                   style={{ background: "linear-gradient(135deg,#1E1B0A,#2A2410)" }}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name}
                       className="max-w-full max-h-full object-contain"
                       data-testid={`admin-product-image-${p.id}`} />
                ) : (
                  <span className="text-[10px] text-[#F5C518] uppercase tracking-wider text-center px-1">No image</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display font-700 text-white truncate">{p.name}</div>
                  <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${
                    p.active
                      ? "bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30"
                      : "bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30"
                  }`}>
                    {p.active ? "Active" : "Inactive"}
                  </span>
                </div>
                {p.tier && (
                  <div className="mt-1 text-[10px] font-display font-700 uppercase tracking-wider text-[#F5C518]">
                    {p.tier}
                  </div>
                )}
                <div className="text-[11px] text-[var(--nb-muted)] mt-1 line-clamp-2">{p.description}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="border border-[var(--nb-border)] rounded p-2">
                <div className="text-[var(--nb-muted)]">Price</div>
                <div className="tabular">{formatNaira(p.price)}</div>
              </div>
              <div className="border border-[var(--nb-border)] rounded p-2">
                <div className="text-[var(--nb-muted)]">Daily</div>
                <div className="tabular">{p.daily_profit_pct}%</div>
              </div>
              <div className="border border-[var(--nb-border)] rounded p-2">
                <div className="text-[var(--nb-muted)]">Days</div>
                <div className="tabular">{p.duration_days}</div>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing({ ...empty, ...p })}
                      data-testid={`edit-product-${p.id}`}
                      className="border-[var(--nb-border)] bg-transparent text-white">
                <Pencil className="w-3 h-3 mr-1"/>Edit
              </Button>
              <Button size="sm" variant="outline" onClick={() => remove(p)} data-testid={`delete-product-${p.id}`}
                      className="border-[#EF4444]/40 bg-transparent text-[#EF4444] hover:bg-[#EF4444]/10">
                <Trash2 className="w-3 h-3 mr-1"/>Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <LoadMore
        shown={Math.min(visible, items.length)}
        total={items.length}
        onMore={setVisible}
        step={9}
        testid="load-more-admin-products"
      />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-[var(--nb-card)] border-[var(--nb-border)] text-white max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editing?.id ? "Edit product" : "New product"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              {/* -------- Image upload -------- */}
              <div>
                <Label>Product image</Label>
                <div className="mt-2 flex items-center gap-3">
                  <div
                    data-nb-image="dark"
                    className="w-24 h-24 shrink-0 rounded-lg grid place-items-center overflow-hidden border border-[var(--nb-border)]"
                    style={{ background: "linear-gradient(135deg,#1E1B0A,#2A2410)" }}
                    data-testid="prod-image-preview"
                  >
                    {editing.image_url ? (
                      <img src={editing.image_url} alt="preview" className="max-w-full max-h-full object-contain" />
                    ) : (
                      <span className="text-[10px] text-[#F5C518] uppercase tracking-wider">No image</span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFile}
                      className="hidden"
                      data-testid="prod-image-file-input"
                    />
                    <Button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      data-testid="prod-image-upload-btn"
                      className="bg-[#0055FF] hover:bg-[#3377FF] w-full"
                    >
                      <ImagePlus className="w-4 h-4 mr-1"/>
                      {uploading ? "Processing…" : editing.image_url ? "Replace image" : "Upload image"}
                    </Button>
                    {editing.image_url && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing({ ...editing, image_url: "" })}
                        data-testid="prod-image-remove-btn"
                        className="w-full border-[#EF4444]/40 bg-transparent text-[#EF4444] hover:bg-[#EF4444]/10"
                      >
                        <X className="w-3 h-3 mr-1"/>Remove
                      </Button>
                    )}
                    <p className="text-[10px] text-[var(--nb-muted)]">
                      JPG / PNG / WebP. Auto-resized to 640px.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label>Name</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                       data-testid="prod-name-input"
                       className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
              </div>

              <div>
                <Label>Tier badge</Label>
                <select
                  value={editing.tier || ""}
                  onChange={(e) => setEditing({ ...editing, tier: e.target.value })}
                  data-testid="prod-tier-select"
                  className="mt-2 w-full h-11 rounded-md bg-[var(--nb-card2)] border border-[var(--nb-border)] text-white px-3 text-sm"
                >
                  {TIER_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-[var(--nb-muted)] mt-1">
                  Controls the colored badge in the corner (Legendary/Epic/Hot/etc). "Auto" picks by daily-return %.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Price</Label>
                  <Input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                         data-testid="prod-price-input"
                         className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
                </div>
                <div>
                  <Label>Daily %</Label>
                  <Input type="number" step="0.1" value={editing.daily_profit_pct} onChange={(e) => setEditing({ ...editing, daily_profit_pct: e.target.value })}
                         data-testid="prod-daily-input"
                         className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
                </div>
                <div>
                  <Label>Days</Label>
                  <Input type="number" value={editing.duration_days} onChange={(e) => setEditing({ ...editing, duration_days: e.target.value })}
                         data-testid="prod-days-input"
                         className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white h-11" />
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                          data-testid="prod-desc-input"
                          className="mt-2 bg-[var(--nb-card2)] border-[var(--nb-border)] text-white" />
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={editing.active}
                        onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                        data-testid="prod-active-switch" />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="border-[var(--nb-border)] bg-transparent text-white"
                    onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} data-testid="prod-save-btn" className="bg-[#0055FF] hover:bg-[#3377FF]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
