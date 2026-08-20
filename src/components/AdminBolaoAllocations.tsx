import { useEffect, useState, useCallback } from 'react';
import { Store, Ticket } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Input, Badge, Spinner, EmptyState } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import { STATUS_LABELS } from '../lib/bolaoKpis';
import { formatBRL } from '../lib/format';
import type { Branch, Bolao, BolaoBranchAllocation, Profile, BolaoOperatorAllocation } from '../lib/types';

export function AdminBolaoAllocations() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [boloes, setBoloes] = useState<Bolao[]>([]);
  const [branchAllocations, setBranchAllocations] = useState<BolaoBranchAllocation[]>([]);
  const [operatorAllocations, setOperatorAllocations] = useState<BolaoOperatorAllocation[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBolaoId, setSelectedBolaoId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: b }, { data: boloesData }, { data: opList }] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('boloes').select('*, product:products(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'operator').eq('active', true).order('name'),
    ]);
    setBranches((b ?? []) as Branch[]);
    setOperators((opList ?? []) as Profile[]);
    const list = (boloesData ?? []) as Bolao[];
    setBoloes(list);

    if (list.length > 0) {
      const [{ data: baData }, { data: oaData }] = await Promise.all([
        supabase.from('bolao_branch_allocations')
          .select('*, branch:branches(*)')
          .in('bolao_id', list.map((bl) => bl.id)),
        supabase.from('bolao_operator_allocations')
          .select('*, operator:profiles(*)')
          .in('bolao_id', list.map((bl) => bl.id)),
      ]);
      setBranchAllocations((baData ?? []) as BolaoBranchAllocation[]);
      setOperatorAllocations((oaData ?? []) as BolaoOperatorAllocation[]);
    } else {
      setBranchAllocations([]);
      setOperatorAllocations([]);
    }

    setSelectedBolaoId((current) => (list.some((bl) => bl.id === current) ? current : (list[0]?.id ?? '')));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const selectedBolao = boloes.find((bl) => bl.id === selectedBolaoId) ?? null;

  const branchName = (branchId: string | null) => {
    if (!branchId) return '—';
    return branches.find((br) => br.id === branchId)?.name ?? '—';
  };
  void branchName;

  const branchAllocationsFor = (bolaoId: string) => branchAllocations.filter((a) => a.bolao_id === bolaoId);
  const getBranchAllocation = (bolaoId: string, branchId: string) =>
    branchAllocations.find((a) => a.bolao_id === bolaoId && a.branch_id === branchId);
  const allocatedSum = (bolaoId: string) => branchAllocationsFor(bolaoId).reduce((s, a) => s + a.shares_allocated, 0);

  const setBranchAllocation = async (bolaoId: string, branchId: string, shares: number) => {
    const key = `${bolaoId}-${branchId}`;
    setSavingKey(key);
    setError(null);
    const { error: rpcError } = await supabase.rpc('allocate_bolao_to_branch', {
      p_bolao_id: bolaoId, p_branch_id: branchId, p_shares: shares,
    });
    setSavingKey(null);
    if (rpcError) { setError(rpcError.message); return; }
    fetchAll();
  };

  if (loading && boloes.length === 0) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader title="Alocação de Bolões para Filiais" subtitle="Distribua cotas de bolões para o estoque de cada filial" />

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{error}</p>}

      {branches.length === 0 ? (
        <Card><EmptyState icon={<Store size={48} />} title="Nenhuma filial cadastrada" description="Cadastre filiais antes de alocar bolões." /></Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>
      ) : boloes.length === 0 ? (
        <Card><EmptyState icon={<Ticket size={48} />} title="Nenhum bolão criado" description="Crie um bolão na aba 'Criar Bolão' para começar a distribuir cotas para as filiais." /></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-start">
          <div className="lg:col-span-2">
            <div className="mb-2"><Input value={search} onChange={setSearch} placeholder="Buscar por produto ou concurso..." /></div>
            <div className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
              {boloes.filter((bolao) => {
                if (!search.trim()) return true;
                const q = search.toLowerCase();
                return bolao.product?.name.toLowerCase().includes(q) || bolao.contest_number.includes(q);
              }).map((bolao) => {
                const perShare = Number(bolao.price) + Number(bolao.service_fee);
                const totalValue = perShare * bolao.total_shares;
                const allocated = allocatedSum(bolao.id);
                const pct = bolao.total_shares > 0 ? Math.round((allocated / bolao.total_shares) * 100) : 0;
                const statusInfo = STATUS_LABELS[bolao.status];
                const isSelected = bolao.id === selectedBolaoId;
                const drawDateFormatted = bolao.draw_date.split('-').reverse().join('/');
                return (
                  <button key={bolao.id} onClick={() => setSelectedBolaoId(bolao.id)}
                    className={`w-full text-left border rounded-lg p-3 transition-all ${isSelected ? 'border-brand-400 bg-brand-50 shadow-sm' : 'border-slate-200 bg-white hover:border-brand-300'}`}>
                    <div className="flex items-start gap-3">
                      <LotteryIcon slug={bolao.product?.slug ?? ''} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900 text-sm truncate">{bolao.product?.name ?? '—'}</span>
                          <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                        </div>
                        <p className="text-xs text-slate-400">Concurso {bolao.contest_number} · {drawDateFormatted}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm font-semibold text-brand-700">R$ {formatBRL(totalValue)}</p>
                          <p className="text-xs text-slate-400">(R$ {formatBRL(perShare)}/cota)</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${allocated >= bolao.total_shares ? 'bg-emerald-500' : allocated > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">{allocated}/{bolao.total_shares} cotas alocadas para filiais</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-3 lg:sticky lg:top-4">
            {!selectedBolao ? (
              <Card><EmptyState icon={<Ticket size={48} />} title="Selecione um bolão" description="Escolha um bolão na lista ao lado para distribuir as cotas para as filiais." /></Card>
            ) : (
              <BranchAllocationPanel bolao={selectedBolao} branches={branches}
                getBranchAllocation={getBranchAllocation}
                operatorAllocations={operatorAllocations}
                operators={operators}
                allocatedSum={allocatedSum(selectedBolao.id)}
                onSetBranchAllocation={setBranchAllocation}
                savingKey={savingKey} />
            )}
          </div>
        </div>
      )}

      {selectedBolao && branches.length > 0 && (
        <Card className="overflow-hidden mt-6">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <Store size={18} className="text-slate-400" />
            <h2 className="font-semibold text-slate-900">Resumo por filial — {selectedBolao.product?.name} · Concurso {selectedBolao.contest_number}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-2.5 font-medium">Filial</th>
                  <th className="px-5 py-2.5 font-medium text-right">Cotas em estoque</th>
                  <th className="px-5 py-2.5 font-medium text-right">Pegas por operadores</th>
                  <th className="px-5 py-2.5 font-medium text-right">Disponível no estoque</th>
                  <th className="px-5 py-2.5 font-medium text-right">Valor em estoque</th>
                </tr>
              </thead>
              <tbody>
                {branchAllocationsFor(selectedBolao.id).map((ba) => {
                  const perShare = Number(selectedBolao.price) + Number(selectedBolao.service_fee);
                  const available = ba.shares_allocated - ba.shares_picked;
                  return (
                    <tr key={ba.id} className="border-b border-slate-50">
                      <td className="px-5 py-2.5 font-medium text-slate-900">{ba.branch?.name ?? '—'}</td>
                      <td className="px-5 py-2.5 text-right text-slate-600">{ba.shares_allocated}</td>
                      <td className="px-5 py-2.5 text-right text-slate-600">{ba.shares_picked}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-amber-600">{available}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-brand-700">R$ {formatBRL(perShare * ba.shares_allocated)}</td>
                    </tr>
                  );
                })}
                {branchAllocationsFor(selectedBolao.id).length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-400">Nenhuma filial recebeu cotas deste bolão ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function BranchAllocationPanel({
  bolao, branches, getBranchAllocation, operatorAllocations, operators,
  allocatedSum, onSetBranchAllocation, savingKey,
}: {
  bolao: Bolao;
  branches: Branch[];
  getBranchAllocation: (bolaoId: string, branchId: string) => BolaoBranchAllocation | undefined;
  operatorAllocations: BolaoOperatorAllocation[];
  operators: Profile[];
  allocatedSum: number;
  onSetBranchAllocation: (bolaoId: string, branchId: string, shares: number) => void;
  savingKey: string | null;
}) {
  const perShare = Number(bolao.price) + Number(bolao.service_fee);
  const totalValue = perShare * bolao.total_shares;
  const allocatedValue = perShare * allocatedSum;
  const unallocated = bolao.total_shares - allocatedSum;
  const unallocatedValue = perShare * unallocated;
  const statusInfo = STATUS_LABELS[bolao.status];
  const locked = bolao.status === 'sold' || bolao.status === 'encalhado';
  const drawDateFormatted = bolao.draw_date.split('-').reverse().join('/');

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 bg-brand-50 border-b border-brand-100">
        <div className="flex items-center gap-3 mb-3">
          <LotteryIcon slug={bolao.product?.slug ?? ''} size={36} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-brand-900">{bolao.product?.name ?? '—'}</h3>
              <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
            </div>
            <p className="text-xs text-slate-500">
              Concurso {bolao.contest_number} · {bolao.jogos} jogo(s) de {bolao.dezenas} dezenas · Sorteio {drawDateFormatted} às {bolao.draw_time?.slice(0, 5)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-lg p-2.5 border border-brand-100">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Valor total</p>
            <p className="text-lg font-bold text-brand-950">R$ {formatBRL(totalValue)}</p>
            <p className="text-[11px] text-slate-400">{bolao.total_shares} cotas · R$ {formatBRL(perShare)}/cota</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-brand-100">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Já no estoque</p>
            <p className="text-lg font-bold text-emerald-600">R$ {formatBRL(allocatedValue)}</p>
            <p className="text-[11px] text-slate-400">{allocatedSum} cota(s)</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-brand-100">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Sem destino</p>
            <p className={`text-lg font-bold ${unallocated > 0 ? 'text-amber-600' : 'text-slate-400'}`}>R$ {formatBRL(unallocatedValue)}</p>
            <p className="text-[11px] text-slate-400">{unallocated} cota(s)</p>
          </div>
        </div>
      </div>

      {locked && (
        <div className="px-5 pt-4 -mb-2">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
            Este bolão já está {bolao.status === 'sold' ? 'totalmente vendido' : 'encalhado'} — reveja com cuidado antes de mudar a distribuição.
          </p>
        </div>
      )}

      <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
        {branches.map((br) => {
          const alloc = getBranchAllocation(bolao.id, br.id);
          const key = `${bolao.id}-${br.id}`;
          const brShares = alloc?.shares_allocated ?? 0;
          const brPicked = alloc?.shares_picked ?? 0;
          const brValue = perShare * brShares;
          const maxAllowed = brShares + unallocated;
          const branchOps = operators.filter((op) => op.branch_id === br.id);
          const opsWithAlloc = operatorAllocations.filter((a) => a.bolao_id === bolao.id && branchOps.some((op) => op.id === a.operator_id));
          return (
            <div key={br.id} className={`border rounded-lg p-4 ${brShares > 0 ? 'border-brand-300 bg-brand-50/30' : 'border-slate-200'}`}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                  <Store size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{br.name}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    {brShares} cota(s) em estoque · {brPicked} pega(s) · R$ {formatBRL(brValue)}
                  </p>
                  {opsWithAlloc.length > 0 && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {opsWithAlloc.length} operador(es) com cotas: {opsWithAlloc.map((a) => a.operator?.name).filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <div className="w-28">
                  <Input type="number" min={brPicked} max={maxAllowed} value={brShares}
                    onChange={(v) => onSetBranchAllocation(bolao.id, br.id, Number(v))} disabled={locked} />
                </div>
                {savingKey === key && <span className="text-[11px] text-slate-400 shrink-0">Salvando...</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
