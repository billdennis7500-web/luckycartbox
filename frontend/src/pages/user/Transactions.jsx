import React, { useEffect, useState } from "react";
import { api, formatNaira } from "@/lib/api";
import { Card } from "@/components/ui/card";

export default function Transactions() {
  const [tx, setTx] = useState([]);
  useEffect(() => { api.get("/transactions").then((r) => setTx(r.data)); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl lg:text-4xl font-800 tracking-tight" data-testid="tx-heading">Transactions</h1>
        <p className="text-[#94A3B8] mt-2">Every wallet movement, in one place.</p>
      </div>
      <Card className="bg-[#0B1524] border-[#1A2B44] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-[#94A3B8] bg-[#121E30]">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1A2B44]">
            {tx.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-[#94A3B8]" data-testid="no-transactions">No transactions yet.</td></tr>}
            {tx.map((t) => (
              <tr key={t.id} data-testid={`tx-row-${t.id}`}>
                <td className="px-4 py-3 text-[#94A3B8]">{new Date(t.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 capitalize">{t.type.replace(/_/g, " ")}</td>
                <td className="px-4 py-3 text-[#94A3B8]">{t.note}</td>
                <td className={`px-4 py-3 text-right tabular font-display font-600 ${t.amount >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}>
                  {t.amount >= 0 ? "+" : ""}{formatNaira(t.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
