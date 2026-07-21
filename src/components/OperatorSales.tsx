import { useEffect, useState, useCallback } from 'react';
import { Ticket, Calendar, Clock, DollarSign, ShoppingBag, TrendingDown, Repeat, Info, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Spinner, EmptyState, Badge, Modal } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import { computeAllocationKpis, STATUS_LABELS, pluralize } from '../lib/bolaoKpis';
import type { BolaoOperatorAllocation, Profile } from '../lib/types';

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface MonthGroup {
  key: string;
  label: string;
  allocations: BolaoOperatorAllocation[];
}

function groupByMonth(allocations: BolaoOperatorAllocation[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const a of allocations) {
    const created = a.bolao?.created_at ?? a.created_at;
    const d = new Date(created);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, { key, label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, allocations: [] });
    }
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

  const fetchAllocations = useCallback(async () => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('bolao_operator_allocations')
      .select('*, bolao:boloes(*, product:products(*), branch:branches(*))')
      .eq('operator_id', profile.id)
      .order('created_at', { ascending: false });
    if (err) {
      setError('Erro ao carregar suas alocações: ' + err.message);
    } else {
      setAllocations((data ?? []) as BolaoOperatorAllocation[]);
    }
    setLoading(false);
  }, [profile]);

  const fetchColleagues = useCallback(async () => {
    if (!profile?.branch_id) {
      console.warn('Operador sem branch_id – não é possível buscar colegas.');
      setColleagues([]);
      return;
    }
    try {
      console.log('Buscando colegas para branch_id:', profile.branch_id);
      const { data, error: err } = await supabase
        .from('profiles')
        .select('*')
        .eq('branch_id', profile.branch_id)
        .eq('role', 'operator')
        .neq('id', profile.id)
        .order('name');
      if (err) {
        console.error('Erro ao buscar colegas:', err);
        setColleagues([]);
      } else {
        console.log('Colegas encontrados:', data?.length ?? 0);
        setColleagues((data ?? []) as Profile[]);
      }
    } catch (e) {
      console.error('Exceção ao buscar colegas:', e);
      setColleagues([]);
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.id) {
      fetchAllocations();
      fetchColleagues();
    } else {
      setLoading(false);
    }
  }, [profile, fetchAllocations, fetchColleagues]);

  // Recarregar colegas manualmente (para testes)
  const refreshColleagues = () => {
    fetchColleagues();
  };

  // Inscrição em tempo real
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel('operator-sales-allocations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bolao_operator_allocations' }, () => fetchAllocations())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boloes' }, () => fetchAllocations())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchAllocations]);

  const openEdit = (a: BolaoOperatorAllocation) => {
    setEditing(a);
    setEditSold(a.shares_sold);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setEditSaving(true);
    setEditError(null);
    const { error: rpcError } = await supabase.rpc('sell_bolao_shares', {
      p_bolao_id: editing.bolao_id,
      p_operator_id: editing.operator_id,
      p_shares_sold: Number(editSold),
    });
    setEditSaving(false);
    if (rpcError) {
      setEditError(rpcError.message);
      return;
    }
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
    if (!transferring || !transferTo) {
      setTransferError('Selecione o colega que vai receber as cotas.');
      return;
    }
    setTransferSaving(true);
    setTransferError(null);
    const { error: rpcError } = await supabase.rpc('transfer_bolao_shares', {
      p_bolao_id: transferring.bolao_id,
      p_from_operator_id: transferring.operator_id,
      p_to_operator_id: transferTo,
      p_shares: Number(transferShares),
    });
    setTransferSaving(false);
    if (rpcError) {
      setTransferError(rpcError.message);
      return;
    }
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
          <EmptyState 
            icon={<AlertCircle size={48} />} 
            title="Você não está alocado em nenhuma filial" 
            description="Solicite ao administrador que aloque você em uma filial para poder vender cotas." 
          />
          <div className="text-center mt-4">
            <Button variant="secondary" onClick={refreshColleagues} size="sm">
              Verificar novamente
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const kpis = computeAllocationKpis(allocations);
  const monthGroups = groupByMonth(allocations);

  return (
    <div>
      <PageHeader title="Minhas Vendas" subtitle="Cotas de bolão alocadas a você para vender" />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {/* KPIs da sua fatia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={<ShoppingBag size={22} />} label="Recebido" bigValue={`R$ ${kpis.gerado.value.toFixed(2)}`} smallValue={pluralize(kpis.gerado.shares, 'cota', 'cotas')} color="brand" />
        <KpiCard icon={<DollarSign size={22} />} label="Vendido" bigValue={`R$ ${kpis.vendido.value.toFixed(2)}`} smallValue={pluralize(kpis.vendido.shares, 'cota vendida', 'cotas vendidas')} color="emerald" lines={[{ label: 'Sua comissão (30%)', value: `R$ ${kpis.vendido.operatorCommission.toFixed(2)}` }]} />
        <KpiCard icon={<TrendingDown size={22} />} label="Encalhado" bigValue={`R$ ${kpis.encalhado.value.toFixed(2)}`} smallValue={pluralize(kpis.encalhado.shares, 'cota', 'cotas')} color="red" />
        <KpiCard icon={<Clock size={22} />} label="Em Aberto" bigValue={`R$ ${kpis.emAberto.value.toFixed(2)}`} smallValue={pluralize(kpis.emAberto.shares, 'cota', 'cotas')} color="accent" />
      </div>

      <h2 className="text-lg font-semibold text-brand-950 mb-4 flex items-center gap-2">
        <Calendar size={20} /> Cotas por Mês
      </h2>

      {monthGroups.length === 0 ? (
        <Card>
          <EmptyState icon={<Ticket size={48} />} title="Nenhuma cota alocada ainda" description="Quando o administrador te alocar cotas de um bolão, elas aparecerão aqui." />
        </Card>
      ) : (
        <div className="space-y-6">
          {monthGroups.map((group) => {
            const k = computeAllocationKpis(group.allocations);
            return (
              <Card key={group.key} className="overflow-hidden">
                <div className="px-5 py-3 bg-brand-50 border-b border-brand-100 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-brand-900">{group.label}</h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-700">
                    <span>Recebido: <strong>R$ {k.gerado.value.toFixed(2)}</strong></span>
                    <span>Vendido: <strong>R$ {k.vendido.value.toFixed(2)}</strong></span>
                    <span>Encalhado: <strong>R$ {k.encalhado.value.toFixed(2)}</strong></span>
                    <span>Sua comissão: <strong>R$ {k.vendido.operatorCommission.toFixed(2)}</strong></span>
                  </div>
                </div>
                <div className="divide-y divide-slate-50">
                  {group.allocations.map((a) => {
                    const b = a.bolao;
                    if (!b) return null;
                    const statusInfo = STATUS_LABELS[b.status];
                    const pct = a.shares_allocated > 0 ? Math.round((a.shares_sold / a.shares_allocated) * 100) : 0;
                    const canSell = b.status !== 'encalhado' && a.shares_sold < a.shares_allocated;
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
                            <span className="flex items-center gap-1"><Info size={12} className="text-slate-400" /> Valor unitário: <strong className="text-slate-700">R$ {perShare.toFixed(2)}</strong></span>
                            <span>Sua fatia: {a.shares_allocated} cota(s) · R$ {totalAllocatedValue.toFixed(2)}</span>
                            <span>Vendida(s): {a.shares_sold}</span>
                            <span className="flex items-center gap-1"><Clock size={11} /> {new Date(b.draw_date).toLocaleDateString('pt-BR')} às {b.draw_time?.slice(0, 5)}</span>
                          </div>
                          {availableShares > 0 && (
                            <div className="text-xs text-emerald-600 mt-0.5">
                              {availableShares} cota(s) disponível(is) para venda
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                          </div>
                          {canTransfer && (
                            <Button size="sm" variant="secondary" onClick={() => openTransfer(a)} title="Repassar cotas">
                              <Repeat size={14} />
                            </Button>
                          )}
                          <Button size="sm" onClick={() => openEdit(a)} disabled={!canSell && a.shares_sold === 0}>
                            Dar baixa
                          </Button>
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

      {/* Modal: dar baixa na própria fatia */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Dar baixa na venda">
        {editing?.bolao && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
              <LotteryIcon slug={editing.bolao.product?.slug ?? ''} size={32} />
              <div>
                <p className="font-semibold text-brand-950">{editing.bolao.product?.name}</p>
                <p className="text-xs text-slate-400">Concurso {editing.bolao.contest_number}</p>
                <p className="text-xs text-slate-400">Valor unitário: R$ {(Number(editing.bolao.price) + Number(editing.bolao.service_fee)).toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-brand-50 p-2 rounded-lg">
                <p className="text-slate-500">Sua fatia total</p>
                <p className="font-semibold">{editing.shares_allocated} cotas</p>
                <p className="text-xs text-slate-400">R$ {(Number(editing.bolao.price) + Number(editing.bolao.service_fee)) * editing.shares_allocated}</p>
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

            {editing.bolao.status === 'encalhado' && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs text-red-700">
                Este bolão já passou da data/hora do sorteio. Não é possível vender mais cotas dele.
              </div>
            )}

            <Input
              label={`Cotas vendidas (de 0 a ${editing.shares_allocated})`}
              type="number"
              min={0}
              max={editing.shares_allocated}
              value={editSold}
              onChange={(v) => setEditSold(Number(v))}
              disabled={editing.bolao.status === 'encalhado'}
            />

            {editError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{editError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={saveEdit} disabled={editSaving || editing.bolao.status === 'encalhado'}>{editSaving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: repassar cotas para um colega */}
      <Modal open={!!transferring} onClose={() => setTransferring(null)} title="Repassar cotas">
        {transferring?.bolao && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
              <LotteryIcon slug={transferring.bolao.product?.slug ?? ''} size={32} />
              <div>
                <p className="font-semibold text-brand-950">{transferring.bolao.product?.name}</p>
                <p className="text-xs text-slate-400">Concurso {transferring.bolao.contest_number}</p>
                <p className="text-xs text-slate-400">Valor unitário: R$ {(Number(transferring.bolao.price) + Number(transferring.bolao.service_fee)).toFixed(2)}</p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-lg p-3 text-sm">
              <p className="text-slate-600">Você tem <strong>{transferring.shares_allocated - transferring.shares_sold}</strong> cota(s) disponível(is) para repassar</p>
              <p className="text-xs text-slate-500">(as já vendidas não podem ser repassadas)</p>
            </div>

            <Select
              label="Repassar para"
              value={transferTo}
              onChange={setTransferTo}
              placeholder={colleagues.length === 0 ? "Nenhum colega disponível" : "Selecione um colega da mesma filial"}
              options={colleagues.map((c) => ({ value: c.id, label: c.name }))}
            />

            {colleagues.length === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700">
                Nenhum outro operador encontrado na sua filial. <br />
                Verifique se há outros operadores cadastrados e se eles têm a mesma filial que você.
                <button onClick={refreshColleagues} className="ml-2 text-brand-600 underline">Recarregar</button>
              </div>
            )}

            <Input
              label="Quantidade de cotas"
              type="number"
              min={1}
              max={transferring.shares_allocated - transferring.shares_sold}
              value={transferShares}
              onChange={(v) => setTransferShares(Number(v))}
            />

            <p className="text-xs text-slate-500 bg-brand-50 rounded-lg p-3">
              A comissão dessas cotas passa a ser do colega que recebe, a partir de agora.
            </p>

            {transferError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{transferError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setTransferring(null)}>Cancelar</Button>
              <Button onClick={doTransfer} disabled={transferSaving || colleagues.length === 0}>
                {transferSaving ? 'Repassando...' : 'Repassar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
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
