import { useEffect, useState, useCallback } from 'react';
import { Ticket, Calendar, Clock, DollarSign, ShoppingBag, Repeat, Info, AlertCircle, Target, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Spinner, EmptyState, Badge, Modal } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import { computeAllocationKpis, STATUS_LABELS, pluralize } from '../lib/bolaoKpis';
import { formatBRL } from '../lib/format';
import { calculateTieredCommission, getCommissionRate, getCurrentTierIndex, getProgressToNextTier, getRemainingToNextTier, COMMISSION_TIERS } from '../lib/commission';
import type { BolaoOperatorAllocation, Profile } from '../lib/types';

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface MonthGroup { key: string; label: string; allocations: BolaoOperatorAllocation[]; }

function groupByMonth(allocations: BolaoOperatorAllocation[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const a of allocations) {
    const created = a.bolao?.created_at ?? a.created_at;
    const d = new Date(created);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, { key, label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, allocations: [] });
    map.get(key)!.allocations.push(a);
  }
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export function OperatorSales() {
  const { profile } = useAuth();
  const [allocations, setAllocations] = useState<BolaoOperatorAllocation[]>([]);
  const [colleagues, setColleagues] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<BolaoOperatorAllocation | null>(null);
  const [editSold, setEditSold] = useState(0);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [transferring, setTransferring] = useState<BolaoOperatorAllocation | null>(null);
  const [transferTo, setTransferTo] = useState('');
  const [transferShares, setTransferShares] = useState(1);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [details, setDetails] = useState<BolaoOperatorAllocation | null>(null);

  const fetchAllocations = useCallback(async () => {
    if (!profile?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('bolao_operator_allocations')
      .select('*, bolao:boloes(*, product:products(*), branch:branches(*))')
      .eq('operator_id', profile.id)
      .order('created_at', { ascending: false });
    if (err) { setError('Erro ao carregar suas alocações: ' + err.message); }
    else { setAllocations((data ?? []) as BolaoOperatorAllocation[]); }
    setLoading(false);
  }, [profile]);

  const fetchColleagues = useCallback(async () => {
    if (!profile?.branch_id) { setColleagues([]); return; }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('branch_id', profile.branch_id)
      .eq('role', 'operator')
      .neq('id', profile.id)
      .order('name');
    setColleagues((data ?? []) as Profile[]);
  }, [profile]);

  useEffect(() => {
    if (profile?.id) { fetchAllocations(); fetchColleagues(); }
    else { setLoading(false); }
  }, [profile, fetchAllocations, fetchColleagues]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel('operator-sales-allocations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bolao_operator_allocations' }, () => fetchAllocations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boloes' }, () => fetchAllocations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchAllocations]);

  const openEdit = (a: BolaoOperatorAllocation) => { setEditing(a); setEditSold(a.shares_sold); setEditError(null); };

  const saveEdit = async () => {
    if (!editing) return;
    setEditSaving(true);
    setEditError(null);
    const { error: rpcError } = await supabase.rpc('sell_bolao_shares', {
      p_bolao_id: editing.bolao_id, p_operator_id: editing.operator_id, p_shares_sold: Number(editSold),
    });
    setEditSaving(false);
    if (rpcError) { setEditError(rpcError.message); return; }
    setEditing(null);
    fetchAllocations();
  };

  const openTransfer = (a: BolaoOperatorAllocation) => {
    setTransferring(a);
    setTransferTo('');
    setTransferShares(Math.max(1, a.shares_allocated - a.shares_sold));
    setTransferError(null);
  };

  const doTransfer = async () => {
    if (!transferring || !transferTo) { setTransferError('Selecione o colega que vai receber as cotas.'); return; }
    setTransferSaving(true);
    setTransferError(null);
    const { error: rpcError } = await supabase.rpc('transfer_bolao_shares', {
      p_bolao_id: transferring.bolao_id, p_from_operator_id: transferring.operator_id, p_to_operator_id: transferTo, p_shares: Number(transferShares),
    });
    setTransferSaving(false);
    if (rpcError) { setTransferError(rpcError.message); return; }
    setTransferring(null);
    fetchAllocations();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  if (!profile?.branch_id) {
    return (
      <div>
        <PageHeader title="Minhas Vendas" />
        <Card>
          <EmptyState icon={<AlertCircle size={48} />} title="Você não está alocado em nenhuma filial" description="Solicite ao administrador que aloque você em uma filial para poder vender cotas." />
        </Card>
      </div>
    );
  }

  const kpis = computeAllocationKpis(allocations);
  const monthGroups = groupByMonth(allocations);

  // Monthly goal: tier is based on TOTAL sales value (price + service_fee);
  // commission is calculated on the service_fee portion at the tier rate.
  const now = new Date();
  const currentMonthLabel = monthNames[now.getMonth()] + ' ' + now.getFullYear();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
  const currentMonthAllocs = allocations.filter((a) => {
    if (!a.bolao) return false;
    const d = new Date(a.bolao.created_at);
    return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}` === currentMonthKey;
  });
  const monthlySalesValue = currentMonthAllocs.reduce((s, a) => {
    if (!a.bolao) return s;
    return s + (Number(a.bolao.price) + Number(a.bolao.service_fee)) * a.shares_sold;
  }, 0);
  const monthlyServiceFee = currentMonthAllocs.reduce((s, a) => {
    if (!a.bolao) return s;
    return s + Number(a.bolao.service_fee) * a.shares_sold;
  }, 0);
  const monthlyCommission = calculateTieredCommission(monthlySalesValue, monthlyServiceFee);
  const currentRate = getCommissionRate(monthlySalesValue);
  const currentTierIdx = getCurrentTierIndex(monthlySalesValue);
  const progressToNext = getProgressToNextTier(monthlySalesValue);
  const remainingToNext = getRemainingToNextTier(monthlySalesValue);

  return (
    <div>
      <PageHeader title="Minhas Vendas" subtitle="Cotas de bolão alocadas a você para vender" />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* Monthly Goal Card with Commission Tiers */}
      <Card className="p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Target size={20} className="text-brand-600" />
          <h2 className="font-semibold text-brand-950">Sua Meta Mensal — {currentMonthLabel}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-brand-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Vendas totais (mês)</p>
            <p className="text-xl font-bold text-brand-950">R$ {formatBRL(monthlySalesValue)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Taxa de serviço: R$ {formatBRL(monthlyServiceFee)}</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Sua comissão ({(currentRate * 100).toFixed(0)}%)</p>
            <p className="text-xl font-bold text-emerald-600">R$ {formatBRL(monthlyCommission)}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Tier atual</p>
            <p className="text-xl font-bold text-slate-700">{COMMISSION_TIERS[currentTierIdx].label}</p>
            <p className="text-[11px] text-slate-400">{COMMISSION_TIERS[currentTierIdx].minLabel} — {COMMISSION_TIERS[currentTierIdx].maxLabel}</p>
          </div>
        </div>

        {/* Tier progress bar */}
        <div className="space-y-2">
          {COMMISSION_TIERS.map((tier, i) => (
            <div key={i} className={`flex items-center gap-3 ${i < currentTierIdx ? 'opacity-50' : ''}`}>
              <span className="text-xs font-medium w-10 text-slate-600">{tier.label}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                {i === currentTierIdx ? (
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all duration-500" style={{ width: `${progressToNext}%` }} />
                ) : i < currentTierIdx ? (
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: '100%' }} />
                ) : null}
              </div>
              <span className="text-[11px] text-slate-400 w-32 text-right">{tier.minLabel}</span>
            </div>
          ))}
        </div>
        {remainingToNext > 0 && (
          <p className="text-xs text-slate-400 mt-3">
            Faltam <strong className="text-brand-600">R$ {formatBRL(remainingToNext)}</strong> em vendas totais para subir para {COMMISSION_TIERS[currentTierIdx + 1]?.label ?? 'o próximo tier'}.
          </p>
        )}
        {currentTierIdx === 2 && (
          <p className="text-xs text-emerald-600 mt-3 font-medium">Você está no tier máximo de 30%!</p>
        )}

        {/* Commission breakdown */}
        <div className="mt-4 bg-slate-50 rounded-lg p-4 text-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Como sua comissão é calculada</p>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-600">Vendas totais no mês</span>
              <span className="font-medium text-slate-900">R$ {formatBRL(monthlySalesValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Tier atingido ({(currentRate * 100).toFixed(0)}% sobre a taxa)</span>
              <span className="font-medium text-brand-700">{COMMISSION_TIERS[currentTierIdx].label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Taxa de serviço arrecadada</span>
              <span className="font-medium text-slate-900">R$ {formatBRL(monthlyServiceFee)}</span>
            </div>
            <div className="flex justify-between pt-1.5 border-t border-slate-200">
              <span className="text-slate-600 font-medium">Comissão = taxa × {(currentRate * 100).toFixed(0)}%</span>
              <span className="font-bold text-emerald-600">R$ {formatBRL(monthlyCommission)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <KpiCard icon={<ShoppingBag size={22} />} label="Recebido" bigValue={`R$ ${formatBRL(kpis.gerado.value)}`} smallValue={pluralize(kpis.gerado.shares, 'cota', 'cotas')} color="brand" />
        <KpiCard icon={<DollarSign size={22} />} label="Vendido" bigValue={`R$ ${formatBRL(kpis.vendido.value)}`} smallValue={pluralize(kpis.vendido.shares, 'cota vendida', 'cotas vendidas')} color="emerald"
          lines={[{ label: 'Sua comissão', value: `R$ ${formatBRL(monthlyCommission)}` }]} />
        <KpiCard icon={<Clock size={22} />} label="Em Aberto" bigValue={`R$ ${formatBRL(kpis.emAberto.value)}`} smallValue={pluralize(kpis.emAberto.shares, 'cota', 'cotas')} color="accent" />
      </div>

      <h2 className="text-lg font-semibold text-brand-950 mb-4 flex items-center gap-2">
        <Calendar size={20} /> Cotas por Mês
      </h2>

      {monthGroups.length === 0 ? (
        <Card><EmptyState icon={<Ticket size={48} />} title="Nenhuma cota alocada ainda" description="Quando o administrador te alocar cotas de um bolão, elas aparecerão aqui." /></Card>
      ) : (
        <div className="space-y-6">
          {monthGroups.map((group) => {
            const k = computeAllocationKpis(group.allocations);
            return (
              <Card key={group.key} className="overflow-hidden">
                <div className="px-5 py-3 bg-brand-50 border-b border-brand-100 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-brand-900">{group.label}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-700">
                    <span>Recebido: <strong>R$ {formatBRL(k.gerado.value)}</strong></span>
                    <span>Vendido: <strong>R$ {formatBRL(k.vendido.value)}</strong></span>
                  </div>
                </div>
                <div className="divide-y divide-slate-50">
                  {group.allocations.map((a) => {
                    const b = a.bolao;
                    if (!b) return null;
                    const statusInfo = STATUS_LABELS[b.status];
                    const pct = a.shares_allocated > 0 ? Math.round((a.shares_sold / a.shares_allocated) * 100) : 0;
                    const canSell = a.shares_sold < a.shares_allocated;
                    const canTransfer = a.shares_allocated - a.shares_sold > 0;
                    const perShare = Number(b.price) + Number(b.service_fee);
                    const totalAllocatedValue = perShare * a.shares_allocated;
                    const availableShares = a.shares_allocated - a.shares_sold;
                    return (
                      <div key={a.id} className="px-5 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3">
                        <LotteryIcon slug={b.product?.slug ?? ''} size={32} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-900 text-sm">{b.product?.name ?? '—'}</span>
                            <span className="text-xs text-slate-400">Concurso {b.contest_number}</span>
                            <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1"><Info size={12} className="text-slate-400" /> Valor unitário: <strong className="text-slate-700">R$ {formatBRL(perShare)}</strong></span>
                            <span>Sua fatia: {a.shares_allocated} cota(s) · R$ {formatBRL(totalAllocatedValue)}</span>
                            <span>Vendida(s): {a.shares_sold}</span>
                            <span className="flex items-center gap-1"><Clock size={11} /> {new Date(b.draw_date).toLocaleDateString('pt-BR')} às {b.draw_time?.slice(0, 5)}</span>
                          </div>
                          {availableShares > 0 && <div className="text-xs text-emerald-600 mt-0.5">{availableShares} cota(s) disponível(is) para venda</div>}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => setDetails(a)} title="Ver detalhes por jogo"><Eye size={14} /></Button>
                          {canTransfer && <Button size="sm" variant="secondary" onClick={() => openTransfer(a)} title="Repassar cotas"><Repeat size={14} /></Button>}
                          <Button size="sm" onClick={() => openEdit(a)} disabled={!canSell && a.shares_sold === 0}>Dar baixa</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Dar baixa na venda">
        {editing?.bolao && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
              <LotteryIcon slug={editing.bolao.product?.slug ?? ''} size={32} />
              <div>
                <p className="font-semibold text-brand-950">{editing.bolao.product?.name}</p>
                <p className="text-xs text-slate-400">Concurso {editing.bolao.contest_number}</p>
                <p className="text-xs text-slate-400">Valor unitário: R$ {formatBRL(Number(editing.bolao.price) + Number(editing.bolao.service_fee))}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-brand-50 p-2 rounded-lg">
                <p className="text-slate-500">Sua fatia total</p>
                <p className="font-semibold">{editing.shares_allocated} cotas</p>
                <p className="text-xs text-slate-400">R$ {formatBRL((Number(editing.bolao.price) + Number(editing.bolao.service_fee)) * editing.shares_allocated)}</p>
              </div>
              <div className="bg-emerald-50 p-2 rounded-lg">
                <p className="text-slate-500">Já vendidas</p>
                <p className="font-semibold">{editing.shares_sold} cotas</p>
              </div>
              <div className="col-span-2 bg-amber-50 p-2 rounded-lg">
                <p className="text-slate-500">Disponíveis para venda</p>
                <p className="font-semibold">{editing.shares_allocated - editing.shares_sold} cotas</p>
              </div>
            </div>
            {editing.bolao.status === 'sold' && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-700">Este bolão já está totalmente vendido.</div>
            )}
            <Input label={`Cotas vendidas (de 0 a ${editing.shares_allocated})`} type="number" min={0} max={editing.shares_allocated}
              value={editSold} onChange={(v) => setEditSold(Number(v))} disabled={editing.bolao.status === 'sold'} />
            {editError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{editError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={saveEdit} disabled={editSaving || editing.bolao.status === 'sold'}>{editSaving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!transferring} onClose={() => setTransferring(null)} title="Repassar cotas">
        {transferring?.bolao && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
              <LotteryIcon slug={transferring.bolao.product?.slug ?? ''} size={32} />
              <div>
                <p className="font-semibold text-brand-950">{transferring.bolao.product?.name}</p>
                <p className="text-xs text-slate-400">Concurso {transferring.bolao.contest_number}</p>
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-sm">
              <p className="text-slate-600">Você tem <strong>{transferring.shares_allocated - transferring.shares_sold}</strong> cota(s) disponível(is) para repassar</p>
              <p className="text-xs text-slate-500">(as já vendidas não podem ser repassadas)</p>
            </div>
            <Select label="Repassar para" value={transferTo} onChange={setTransferTo}
              placeholder={colleagues.length === 0 ? "Nenhum colega disponível" : "Selecione um colega da mesma filial"}
              options={colleagues.map((c) => ({ value: c.id, label: c.name }))} />
            {colleagues.length === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700">
                Nenhum outro operador encontrado na sua filial.
              </div>
            )}
            <Input label="Quantidade de cotas" type="number" min={1} max={transferring.shares_allocated - transferring.shares_sold}
              value={transferShares} onChange={(v) => setTransferShares(Number(v))} />
            <p className="text-xs text-slate-500 bg-brand-50 rounded-lg p-3">A comissão dessas cotas passa a ser do colega que recebe, a partir de agora.</p>
            {transferError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{transferError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setTransferring(null)}>Cancelar</Button>
              <Button onClick={doTransfer} disabled={transferSaving || colleagues.length === 0}>{transferSaving ? 'Repassando...' : 'Repassar'}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!details} onClose={() => setDetails(null)} title="Detalhes da venda por jogo">
        {details?.bolao && (() => {
          const b = details.bolao;
          const perShare = Number(b.price) + Number(b.service_fee);
          const perShareFee = Number(b.service_fee);
          const perSharePrice = Number(b.price);
          const soldShares = details.shares_sold;
          const allocatedShares = details.shares_allocated;
          const unsoldShares = allocatedShares - soldShares;
          const soldValue = perShare * soldShares;
          const unsoldValue = perShare * unsoldShares;
          const soldFee = perShareFee * soldShares;
          const commissionRate = getCommissionRate(monthlySalesValue);
          const shareCommission = soldFee * commissionRate;
          return (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
                <LotteryIcon slug={b.product?.slug ?? ''} size={32} />
                <div>
                  <p className="font-semibold text-brand-950">{b.product?.name}</p>
                  <p className="text-xs text-slate-400">Concurso {b.contest_number} · {b.jogos} jogo(s) de {b.dezenas} dezenas</p>
                  <p className="text-xs text-slate-400">Sorteio: {new Date(b.draw_date).toLocaleDateString('pt-BR')} às {b.draw_time?.slice(0, 5)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-brand-50 p-3 rounded-lg">
                  <p className="text-slate-500 text-xs">Cotas recebidas</p>
                  <p className="font-bold text-brand-950 text-lg">{allocatedShares}</p>
                  <p className="text-xs text-slate-400">R$ {formatBRL(perShare * allocatedShares)}</p>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg">
                  <p className="text-slate-500 text-xs">Cotas vendidas</p>
                  <p className="font-bold text-emerald-700 text-lg">{soldShares}</p>
                  <p className="text-xs text-slate-400">R$ {formatBRL(soldValue)}</p>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg">
                  <p className="text-slate-500 text-xs">Cotas não vendidas</p>
                  <p className="font-bold text-amber-700 text-lg">{unsoldShares}</p>
                  <p className="text-xs text-slate-400">R$ {formatBRL(unsoldValue)}</p>
                </div>
                <div className="bg-slate-100 p-3 rounded-lg">
                  <p className="text-slate-500 text-xs">Taxa de serviço vendida</p>
                  <p className="font-bold text-slate-700 text-lg">R$ {formatBRL(soldFee)}</p>
                  <p className="text-xs text-slate-400">Comissão ({(commissionRate * 100).toFixed(0)}%): R$ {formatBRL(shareCommission)}</p>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Detalhamento por cota</p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-slate-500 border-b border-slate-100">
                        <th className="px-4 py-2 font-medium">Cota</th>
                        <th className="px-4 py-2 font-medium text-right">Valor</th>
                        <th className="px-4 py-2 font-medium text-right">Taxa serviço</th>
                        <th className="px-4 py-2 font-medium text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: allocatedShares }).map((_, i) => {
                        const isSold = i < soldShares;
                        return (
                          <tr key={i} className="border-b border-slate-50">
                            <td className="px-4 py-2 text-slate-700">#{i + 1}</td>
                            <td className="px-4 py-2 text-right text-slate-600">R$ {formatBRL(perShare)}</td>
                            <td className="px-4 py-2 text-right text-slate-600">R$ {formatBRL(perShareFee)}</td>
                            <td className="px-4 py-2 text-center">
                              {isSold ? (
                                <Badge color="green">Vendida</Badge>
                              ) : (
                                <Badge color="slate">Disponível</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-brand-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600">Valor total vendido</span>
                  <span className="font-semibold text-brand-950">R$ {formatBRL(soldValue)}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600">- Valor da cota (casa)</span>
                  <span className="text-slate-500">R$ {formatBRL(perSharePrice * soldShares)}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600">= Taxa de serviço</span>
                  <span className="font-semibold text-slate-700">R$ {formatBRL(soldFee)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-brand-200">
                  <span className="text-slate-600 font-medium">Sua comissão ({(commissionRate * 100).toFixed(0)}%)</span>
                  <span className="font-bold text-emerald-600">R$ {formatBRL(shareCommission)}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

function KpiCard({ icon, label, bigValue, smallValue, lines, color }: {
  icon: React.ReactNode; label: string; bigValue: string; smallValue?: string; lines?: { label: string; value: string }[]; color: string;
}) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600', emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', accent: 'bg-accent-50 text-accent-600',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>{icon}</div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-brand-950">{bigValue}</p>
      {smallValue && <p className="text-sm text-slate-500 mt-1">{smallValue}</p>}
      {lines && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{l.label}</span>
              <span className="font-semibold text-slate-700">{l.value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
