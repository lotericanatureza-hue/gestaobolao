import { useEffect, useState, useCallback } from 'react';
import { ShoppingBag, DollarSign, TrendingDown, Calendar, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Input, Select, Spinner, EmptyState, Badge } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import { computeAllocationKpis, STATUS_LABELS, pluralize, type BolaoKpis } from '../lib/bolaoKpis';
import type { BolaoOperatorAllocation, BolaoStatus } from '../lib/types';

type FilterStatus = 'all' | BolaoStatus;

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface MonthGroup {
  key: string;
  label: string;
  allocations: BolaoOperatorAllocation[];
  kpis: BolaoKpis;
}

function groupByMonth(allocations: BolaoOperatorAllocation[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const a of allocations) {
    const created = a.bolao?.created_at ?? a.created_at;
    const d = new Date(created);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, { key, label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, allocations: [], kpis: computeAllocationKpis([]) });
    }
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
    // Só a fatia deste operador — nada de outros bolões da filial que não
    // foram alocados a ele.
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

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Suas cotas, comissões e encalhes — só o que está alocado a você" />

      {/* KPIs da sua fatia (não da filial inteira) */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Visão Geral</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={<ShoppingBag size={22} />}
          label="Recebido"
          bigValue={`R$ ${kpis.gerado.value.toFixed(2)}`}
          smallValue={pluralize(kpis.gerado.shares, 'cota', 'cotas')}
          color="brand"
          lines={[{ label: 'Comissão total', value: `R$ ${kpis.gerado.commission.toFixed(2)}` }]}
        />
        <KpiCard
          icon={<DollarSign size={22} />}
          label="Vendido"
          bigValue={`R$ ${kpis.vendido.value.toFixed(2)}`}
          smallValue={pluralize(kpis.vendido.shares, 'cota vendida', 'cotas vendidas')}
          color="emerald"
          lines={[{ label: 'Sua comissão (30%)', value: `R$ ${kpis.vendido.operatorCommission.toFixed(2)}` }]}
        />
        <KpiCard
          icon={<TrendingDown size={22} />}
          label="Encalhado"
          bigValue={`R$ ${kpis.encalhado.value.toFixed(2)}`}
          smallValue={pluralize(kpis.encalhado.shares, 'cota encalhada', 'cotas encalhadas')}
          color="red"
        />
        <KpiCard
          icon={<Clock size={22} />}
          label="Em Aberto"
          bigValue={`R$ ${kpis.emAberto.value.toFixed(2)}`}
          smallValue={pluralize(kpis.emAberto.shares, 'cota aguardando sorteio', 'cotas aguardando sorteio')}
          color="accent"
        />
      </div>

      {/* Monthly breakdown */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Calendar size={16} /> Por Mês
      </h2>

      {monthGroups.length === 0 ? (
        <Card>
          <EmptyState icon={<ShoppingBag size={48} />} title="Nenhuma cota alocada ainda" description="Quando o administrador te alocar cotas de um bolão, elas aparecerão aqui." />
        </Card>
      ) : (
        <div className="space-y-6 mb-8">
          {monthGroups.map((group) => (
            <Card key={group.key} className="overflow-hidden">
              <div className="px-5 py-3 bg-brand-50 border-b border-brand-100">
                <h3 className="font-semibold text-brand-900">{group.label}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5">
                <KpiCard icon={<ShoppingBag size={20} />} label="Recebido" bigValue={`R$ ${group.kpis.gerado.value.toFixed(2)}`} smallValue={pluralize(group.kpis.gerado.shares, 'cota', 'cotas')} color="brand" />
                <KpiCard icon={<DollarSign size={20} />} label="Vendido" bigValue={`R$ ${group.kpis.vendido.value.toFixed(2)}`} smallValue={pluralize(group.kpis.vendido.shares, 'cota', 'cotas')} color="emerald" />
                <KpiCard icon={<TrendingDown size={20} />} label="Encalhado" bigValue={`R$ ${group.kpis.encalhado.value.toFixed(2)}`} smallValue={pluralize(group.kpis.encalhado.shares, 'cota', 'cotas')} color="red" />
                <KpiCard icon={<Clock size={20} />} label="Em Aberto" bigValue={`R$ ${group.kpis.emAberto.value.toFixed(2)}`} smallValue={pluralize(group.kpis.emAberto.shares, 'cota', 'cotas')} color="accent" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Filters + List (só leitura — dar baixa e repasse ficam em "Minhas Vendas") */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Suas Cotas</h2>
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
              { value: 'pending', label: 'Aguardando venda' },
              { value: 'partial', label: 'Parciais' },
              { value: 'sold', label: 'Vendidos' },
              { value: 'encalhado', label: 'Encalhados' },
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShoppingBag size={48} />}
            title={allocations.length === 0 ? 'Nenhuma cota alocada ainda' : 'Nenhuma cota encontrada'}
            description={allocations.length === 0 ? 'Quando o administrador te alocar cotas de um bolão, elas aparecerão aqui.' : 'Tente outro filtro ou busca.'}
          />
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

function KpiCard({
  icon,
  label,
  bigValue,
  smallValue,
  lines,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  bigValue: string;
  smallValue?: string;
  lines?: { label: string; value: string }[];
  color: string;
}) {
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
