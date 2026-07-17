import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, Clock, AlertTriangle, Trash2, Pencil, ShoppingBag, Plus, Minus, DollarSign, Percent, TrendingDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import type { Bolao, BolaoStatus } from '../lib/types';

type FilterStatus = 'all' | BolaoStatus;

interface OpStats {
  total: number;
  totalValue: number;
  bolaoValue: number;
  commissionValue: number;
  operatorCommission: number;
  lotericaCommission: number;
  soldCount: number;
  soldValue: number;
  soldCommission: number;
  soldOperatorCommission: number;
  partialCount: number;
  partialValue: number;
  unsoldShares: number;
  unsoldValue: number;
  unsoldBolaoValue: number;
  unsoldCommission: number;
  encalheLoss: number;
}

function computeOpStats(boloes: Bolao[]): OpStats {
  const shareVal = (b: Bolao) => b.total_shares > 0
    ? (Number(b.price) + Number(b.service_fee)) / b.total_shares
    : 0;
  const sharePrice = (b: Bolao) => b.total_shares > 0 ? Number(b.price) / b.total_shares : 0;
  const shareFee = (b: Bolao) => b.total_shares > 0 ? Number(b.service_fee) / b.total_shares : 0;

  const bolaoValue = boloes.reduce((s, b) => s + Number(b.price), 0);
  const commissionValue = boloes.reduce((s, b) => s + Number(b.service_fee), 0);

  const soldBoloes = boloes.filter((b) => b.status === 'sold');
  const partialBoloes = boloes.filter((b) => b.status === 'partial');

  const soldValue = boloes.reduce((s, b) => s + shareVal(b) * b.sold_shares, 0);
  const soldCommission = boloes.reduce((s, b) => s + shareFee(b) * b.sold_shares, 0);
  const soldOperatorCommission = soldCommission * 0.3;

  const unsoldShares = boloes.reduce((s, b) => s + (b.total_shares - b.sold_shares), 0);
  const unsoldValue = boloes.reduce((s, b) => s + shareVal(b) * (b.total_shares - b.sold_shares), 0);
  const unsoldBolaoValue = boloes.reduce((s, b) => s + sharePrice(b) * (b.total_shares - b.sold_shares), 0);
  const unsoldCommission = boloes.reduce((s, b) => s + shareFee(b) * (b.total_shares - b.sold_shares), 0);

  return {
    total: boloes.length,
    totalValue: bolaoValue + commissionValue,
    bolaoValue,
    commissionValue,
    operatorCommission: commissionValue * 0.3,
    lotericaCommission: commissionValue * 0.7,
    soldCount: soldBoloes.length,
    soldValue,
    soldCommission,
    soldOperatorCommission,
    partialCount: partialBoloes.length,
    partialValue: partialBoloes.reduce((s, b) => s + shareVal(b) * b.sold_shares, 0),
    unsoldShares,
    unsoldValue,
    unsoldBolaoValue,
    unsoldCommission,
    encalheLoss: unsoldBolaoValue,
  };
}

export function OperatorManage() {
  const { profile } = useAuth();
  const [boloes, setBoloes] = useState<Bolao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Bolao | null>(null);
  const [editSold, setEditSold] = useState(0);
  const [editTotal, setEditTotal] = useState(1);
  const [editPrice, setEditPrice] = useState(0);
  const [editFee, setEditFee] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchBoloes = useCallback(async () => {
    if (!profile?.branch_id) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('boloes')
      .select('*, product:products(*), branch:branches(*), operator:profiles(*)')
      .eq('branch_id', profile.branch_id)
      .order('created_at', { ascending: false });
    setBoloes((data ?? []) as Bolao[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchBoloes();

    const channel = supabase
      .channel('operator-manage-boloes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boloes' }, () => fetchBoloes())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchBoloes]);

  const openEdit = (b: Bolao) => {
    setEditing(b);
    setEditSold(b.sold_shares);
    setEditTotal(b.total_shares);
    setEditPrice(Number(b.price));
    setEditFee(Number(b.service_fee));
    setEditNotes(b.notes ?? '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const sold = Math.min(Number(editSold), Number(editTotal));
    let status: BolaoStatus = 'pending';
    if (sold >= Number(editTotal)) status = 'sold';
    else if (sold > 0) status = 'partial';
    await supabase.from('boloes').update({
      sold_shares: sold,
      total_shares: Number(editTotal),
      price: Number(editPrice),
      service_fee: Number(editFee),
      status,
      notes: editNotes.trim() || null,
    }).eq('id', editing.id);
    setSaving(false);
    setEditing(null);
  };

  const quickSellShare = async (b: Bolao) => {
    if (b.sold_shares >= b.total_shares) return;
    const newSold = b.sold_shares + 1;
    const status: BolaoStatus = newSold >= b.total_shares ? 'sold' : 'partial';
    await supabase.from('boloes').update({ sold_shares: newSold, status }).eq('id', b.id);
  };

  const remove = async (b: Bolao) => {
    if (!confirm(`Excluir o bolão "${b.product?.name}" - Concurso ${b.contest_number}?`)) return;
    await supabase.from('boloes').delete().eq('id', b.id);
  };

  const filtered = boloes.filter((b) => {
    if (filter !== 'all' && b.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return b.product?.name.toLowerCase().includes(q) || b.contest_number.includes(q);
    }
    return true;
  });

  const stats = computeOpStats(boloes);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  const statusBadge = (status: string) => {
    if (status === 'sold') return <Badge color="green">Vendido</Badge>;
    if (status === 'partial') return <Badge color="amber">Parcial</Badge>;
    return <Badge color="red">Encalhado</Badge>;
  };

  return (
    <div>
      <PageHeader title="Gestão de Bolões" subtitle="Gerencie bolões, comissões e encalhes da sua filial" />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard icon={<ShoppingBag size={22} />} label="Total" bigValue={`R$ ${stats.totalValue.toFixed(2)}`} smallValue={`${stats.total} bolões`} color="brand" />
        <KpiCard icon={<CheckCircle2 size={22} />} label="Vendidos" bigValue={`R$ ${stats.soldValue.toFixed(2)}`} smallValue={`${stats.soldCount} bolões`} color="emerald" />
        <KpiCard icon={<Clock size={22} />} label="Parciais" bigValue={`R$ ${stats.partialValue.toFixed(2)}`} smallValue={`${stats.partialCount} bolões`} color="amber" />
        <KpiCard icon={<AlertTriangle size={22} />} label="Encalhados" bigValue={`R$ ${stats.unsoldValue.toFixed(2)}`} smallValue={`${stats.unsoldShares} cotas não vendidas`} color="red" />
      </div>

      {/* Commission breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard icon={<DollarSign size={22} />} label="Valor dos Bolões" bigValue={`R$ ${stats.bolaoValue.toFixed(2)}`} smallValue="Soma dos preços" color="brand" />
        <KpiCard icon={<Percent size={22} />} label="Comissão Total" bigValue={`R$ ${stats.commissionValue.toFixed(2)}`} smallValue="Taxa de serviço" color="accent" />
        <KpiCard icon={<DollarSign size={22} />} label="Comissão Operador (30%)" bigValue={`R$ ${stats.operatorCommission.toFixed(2)}`} smallValue={`Vendida: R$ ${stats.soldOperatorCommission.toFixed(2)}`} color="emerald" />
        <KpiCard icon={<TrendingDown size={22} />} label="Prejuízo (Encalhe)" bigValue={`R$ ${stats.encalheLoss.toFixed(2)}`} smallValue={`${stats.unsoldShares} cotas encalhadas`} color="red" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <Input value={search} onChange={setSearch} placeholder="Buscar por produto ou concurso..." />
        </div>
        <div className="sm:w-48">
          <Select
            value={filter}
            onChange={(v) => setFilter(v as FilterStatus)}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'pending', label: 'Encalhados' },
              { value: 'partial', label: 'Parciais' },
              { value: 'sold', label: 'Vendidos' },
            ]}
          />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShoppingBag size={48} />}
            title={boloes.length === 0 ? "Nenhum bolão criado" : "Nenhum bolão encontrado"}
            description={boloes.length === 0 ? "Crie bolões na aba 'Criar Bolão' para começar." : "Tente outro filtro ou busca."}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const pct = b.total_shares > 0 ? Math.round((b.sold_shares / b.total_shares) * 100) : 0;
            const nextQuota = b.sold_shares + 1;
            const shareValue = b.total_shares > 0 ? (Number(b.price) + Number(b.service_fee)) / b.total_shares : 0;
            const operatorShare = (Number(b.service_fee) / b.total_shares) * 0.3;
            return (
              <Card key={b.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <LotteryIcon slug={b.product?.slug ?? ''} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-brand-950">{b.product?.name ?? '—'}</h3>
                        {statusBadge(b.status)}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400 mt-1">
                        <span>Concurso: {b.contest_number}</span>
                        <span>Dezenas: {b.dezenas}</span>
                        <span>Sorteio: {new Date(b.draw_date).toLocaleDateString('pt-BR')}</span>
                        <span>Bolão: R$ {Number(b.price).toFixed(2)}</span>
                        <span>Comissão: R$ {Number(b.service_fee).toFixed(2)}</span>
                        <span>Operador (30%): R$ {(Number(b.service_fee) * 0.3).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <p className="text-xs text-slate-500">{b.sold_shares}/{b.total_shares} cotas · R$ {shareValue.toFixed(2)}/cota</p>
                    </div>
                    {b.sold_shares < b.total_shares && (
                      <Button size="sm" variant="accent" onClick={() => quickSellShare(b)}>
                        <Plus size={14} /> Cota {nextQuota}
                      </Button>
                    )}
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(b)}><Pencil size={14} /></Button>
                      <Button size="sm" variant="danger" onClick={() => remove(b)}><Trash2 size={14} /></Button>
                    </div>
                  </div>
                </div>
                {b.notes && <p className="text-xs text-slate-400 mt-2 pt-2 border-t border-slate-50">{b.notes}</p>}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar Bolão">
        {editing && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
              <LotteryIcon slug={editing.product?.slug ?? ''} size={32} />
              <div>
                <p className="font-semibold text-brand-950">{editing.product?.name}</p>
                <p className="text-xs text-slate-400">Concurso {editing.contest_number} · Sorteio {new Date(editing.draw_date).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            {/* Quick sell controls */}
            <div className="bg-brand-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-brand-900">Baixa de Cota Vendida</span>
                <span className="text-xs text-slate-500">Próxima cota: <span className="font-bold text-brand-700">#{editSold + 1}</span></span>
              </div>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setEditSold(Math.max(0, editSold - 1))}
                  disabled={editSold <= 0}
                  className="w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 transition-all"
                >
                  <Minus size={18} />
                </button>
                <div className="text-center">
                  <p className="text-3xl font-bold text-brand-700">{editSold}</p>
                  <p className="text-xs text-slate-400">de {editTotal} cotas</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditSold(Math.min(editTotal, editSold + 1))}
                  disabled={editSold >= editTotal}
                  className="w-10 h-10 rounded-lg bg-accent-500 text-white flex items-center justify-center hover:bg-accent-600 disabled:opacity-40 transition-all"
                >
                  <Plus size={18} />
                </button>
              </div>
              {editSold < editTotal && (
                <p className="text-center text-xs text-slate-500 mt-3">
                  Ao confirmar, a cota <span className="font-semibold text-accent-600">#{editSold + 1}</span> será a próxima a ser vendida.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Preço do bolão (R$)" type="number" step="0.01" value={editPrice} onChange={(v) => setEditPrice(Number(v))} min={0} />
              <Input label="Comissão / Taxa (R$)" type="number" step="0.01" value={editFee} onChange={(v) => setEditFee(Number(v))} min={0} />
            </div>

            <div className="bg-brand-50 rounded-lg p-3 text-xs text-brand-700 flex flex-wrap gap-x-4 gap-y-1">
              <span>Comissão total: <strong>R$ {Number(editFee).toFixed(2)}</strong></span>
              <span>Loterica (70%): <strong>R$ {(Number(editFee) * 0.7).toFixed(2)}</strong></span>
              <span>Operador (30%): <strong>R$ {(Number(editFee) * 0.3).toFixed(2)}</strong></span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Cotas vendidas" type="number" value={editSold} onChange={(v) => setEditSold(Number(v))} min={0} />
              <Input label="Total de cotas" type="number" value={editTotal} onChange={(v) => setEditTotal(Number(v))} min={1} />
            </div>
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Observações</span>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
              />
            </label>
            <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600">
              Status atual: {statusBadge(editing.status)}
              <p className="text-xs text-slate-400 mt-1">
                {Number(editSold) >= Number(editTotal) ? 'Será marcado como Vendido' : Number(editSold) > 0 ? 'Será marcado como Parcial' : 'Será marcado como Encalhado'}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={saveEdit} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function KpiCard({ icon, label, bigValue, smallValue, color }: { icon: React.ReactNode; label: string; bigValue: string; smallValue: string; color: string }) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    accent: 'bg-accent-50 text-accent-600',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
          {icon}
        </div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-brand-950">{bigValue}</p>
      <p className="text-sm text-slate-500 mt-1">{smallValue}</p>
    </Card>
  );
}
