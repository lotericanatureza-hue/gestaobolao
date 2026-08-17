import { useEffect, useState, useCallback } from 'react';
import { ShoppingBag, DollarSign, TrendingDown, Calendar, Clock, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Input, Select, Spinner, EmptyState, Badge } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import { computeAllocationKpis, STATUS_LABELS, pluralize, type BolaoKpis } from '../lib/bolaoKpis';
import { formatBRL } from '../lib/format';
import { calculateTieredCommission, getCommissionRate, getCurrentTierIndex, getProgressToNextTier, getRemainingToNextTier, COMMISSION_TIERS } from '../lib/commission';
import type { BolaoOperatorAllocation, BolaoStatus } from '../lib/types';

type FilterStatus = 'all' | BolaoStatus;

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface MonthGroup { key: string; label: string; allocations: BolaoOperatorAllocation[]; kpis: BolaoKpis; }

function groupByMonth(allocations: BolaoOperatorAllocation[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const a of allocations) {
    const created = a.bolao?.created_at ?? a.created_at;
    const d = new Date(created);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, { key, label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, allocations: [], kpis: computeAllocationKpis([]) });
    map.get(key)!.allocations.push(a);
  }
  const groups = Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  for (const g of groups) g.kpis = computeAllocationKpis(g.allocations);
  return groups;
}

export function OperatorManage() {
  const { profile } = useAuth();
  const [allocations, setAllocations] = useState<BolaoOperatorAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');

  const fetchAllocations = useCallback(async () => {
    if (!profile?.id) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('bolao_operator_allocations')
      .select('*, bolao:boloes(*, product:products(*), branch:branches(*))')
      .eq('operator_id', profile.id)
      .order('created_at', { ascending: false });
    setAllocations((data ?? []) as BolaoOperatorAllocation[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchAllocations();
    const channel = supabase
      .channel('operator-manage-allocations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bolao_operator_allocations' }, () => fetchAllocations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boloes' }, () => fetchAllocations())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAllocations]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  const filtered = allocations.filter((a) => {
    const b = a.bolao;
    if (!b) return false;
    if (filter !== 'all' && b.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return b.product?.name.toLowerCase().includes(q) || b.contest_number.includes(q);
    }
    return true;
  });

  const monthGroups = groupByMonth(allocations);
  const kpis = computeAllocationKpis(allocations);

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
      <PageHeader title="Dashboard" subtitle="Suas cotas, comissões e encalhes — só o que está alocado a você" />

      {/* Monthly Goal Card */}
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

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Visão Geral</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={<ShoppingBag size={22} />} label="Recebido" bigValue={`R$ ${formatBRL(kpis.gerado.value)}`} smallValue={pluralize(kpis.gerado.shares, 'cota', 'cotas')} color="brand"
          lines={[{ label: 'Taxa total', value: `R$ ${formatBRL(kpis.gerado.commission)}` }]} />
        <KpiCard icon={<DollarSign size={22} />} label="Vendido" bigValue={`R$ ${formatBRL(kpis.vendido.value)}`} smallValue={pluralize(kpis.vendido.shares, 'cota vendida', 'cotas vendidas')} color="emerald"
          lines={[{ label: 'Sua comissão', value: `R$ ${formatBRL(monthlyCommission)}` }]} />
        <KpiCard icon={<TrendingDown size={22} />} label="Encalhado" bigValue={`R$ ${formatBRL(kpis.encalhado.value)}`} smallValue={pluralize(kpis.encalhado.shares, 'cota encalhada', 'cotas encalhadas')} color="red" />
        <KpiCard icon={<Clock size={22} />} label="Em Aberto" bigValue={`R$ ${formatBRL(kpis.emAberto.value)}`} smallValue={pluralize(kpis.emAberto.shares, 'cota aguardando sorteio', 'cotas aguardando sorteio')} color="accent" />
      </div>

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Calendar size={16} /> Por Mês
      </h2>
      {monthGroups.length === 0 ? (
        <Card><EmptyState icon={<ShoppingBag size={48} />} title="Nenhuma cota alocada ainda" description="Quando o administrador te alocar cotas de um bolão, elas aparecerão aqui." /></Card>
      ) : (
        <div className="space-y-6 mb-8">
          {monthGroups.map((group) => (
            <Card key={group.key} className="overflow-hidden">
              <div className="px-5 py-3 bg-brand-50 border-b border-brand-100"><h3 className="font-semibold text-brand-900">{group.label}</h3></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5">
                <KpiCard icon={<ShoppingBag size={20} />} label="Recebido" bigValue={`R$ ${formatBRL(group.kpis.gerado.value)}`} smallValue={pluralize(group.kpis.gerado.shares, 'cota', 'cotas')} color="brand" />
                <KpiCard icon={<DollarSign size={20} />} label="Vendido" bigValue={`R$ ${formatBRL(group.kpis.vendido.value)}`} smallValue={pluralize(group.kpis.vendido.shares, 'cota', 'cotas')} color="emerald" />
                <KpiCard icon={<TrendingDown size={20} />} label="Encalhado" bigValue={`R$ ${formatBRL(group.kpis.encalhado.value)}`} smallValue={pluralize(group.kpis.encalhado.shares, 'cota', 'cotas')} color="red" />
                <KpiCard icon={<Clock size={20} />} label="Em Aberto" bigValue={`R$ ${formatBRL(group.kpis.emAberto.value)}`} smallValue={pluralize(group.kpis.emAberto.shares, 'cota', 'cotas')} color="accent" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Suas Cotas</h2>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1"><Input value={search} onChange={setSearch} placeholder="Buscar por produto ou concurso..." /></div>
        <div className="sm:w-48">
          <Select value={filter} onChange={(v) => setFilter(v as FilterStatus)}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'pending', label: 'Aguardando venda' },
              { value: 'partial', label: 'Parciais' },
              { value: 'sold', label: 'Vendidos' },
              { value: 'encalhado', label: 'Encalhados' },
            ]} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<ShoppingBag size={48} />}
            title={allocations.length === 0 ? 'Nenhuma cota alocada ainda' : 'Nenhuma cota encontrada'}
            description={allocations.length === 0 ? 'Quando o administrador te alocar cotas de um bolão, elas aparecerão aqui.' : 'Tente outro filtro ou busca.'} />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const b = a.bolao;
            if (!b) return null;
            const pct = a.shares_allocated > 0 ? Math.round((a.shares_sold / a.shares_allocated) * 100) : 0;
            const statusInfo = STATUS_LABELS[b.status];
            return (
              <Card key={a.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <LotteryIcon slug={b.product?.slug ?? ''} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-brand-950">{b.product?.name ?? '—'}</h3>
                        <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                        {b.status === 'encalhado' && !b.encalhe_settled && <Badge color="amber">Pendente de baixa</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400 mt-1">
                        <span>Concurso: {b.contest_number}</span>
                        <span>{b.jogos} jogo(s) de {b.dezenas} dezenas</span>
                        <span>Sorteio: {new Date(b.draw_date).toLocaleDateString('pt-BR')} às {b.draw_time?.slice(0, 5)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 mb-1 justify-end">
                      <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">{a.shares_sold}/{a.shares_allocated} cotas suas</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
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
