import { useEffect, useState, useCallback } from 'react';
import { ArrowRightLeft, Store, Users, Ticket, Repeat, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Input, Button, Select, Badge, Spinner, EmptyState } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import { STATUS_LABELS } from '../lib/bolaoKpis';
import type { Branch, Profile, Bolao, BolaoOperatorAllocation } from '../lib/types';

export function AdminBolaoAllocations() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [boloes, setBoloes] = useState<Bolao[]>([]);
  const [allocations, setAllocations] = useState<BolaoOperatorAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedBolaoId, setSelectedBolaoId] = useState<string>('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Repasse entre operadores
  const [transferFrom, setTransferFrom] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferShares, setTransferShares] = useState(1);
  const [transferSaving, setTransferSaving] = useState(false);

  const fetchBranchesAndOperators = useCallback(async () => {
    const [{ data: b }, { data: p }] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('profiles').select('*').eq('role', 'operator').order('name'),
    ]);
    setBranches((b ?? []) as Branch[]);
    setOperators((p ?? []) as Profile[]);
    if (!selectedBranch && (b ?? []).length > 0) {
      setSelectedBranch((b ?? [])[0].id);
    }
  }, [selectedBranch]);

  const fetchBoloesAndAllocations = useCallback(async () => {
    if (!selectedBranch) { setLoading(false); return; }
    setLoading(true);
    const { data: boloesData } = await supabase
      .from('boloes')
      .select('*, product:products(*), branch:branches(*)')
      .eq('branch_id', selectedBranch)
      .order('draw_date', { ascending: false });
    const list = (boloesData ?? []) as Bolao[];
    setBoloes(list);

    if (list.length > 0) {
      const { data: allocData } = await supabase
        .from('bolao_operator_allocations')
        .select('*, operator:profiles(*)')
        .in('bolao_id', list.map((b) => b.id));
      setAllocations((allocData ?? []) as BolaoOperatorAllocation[]);
    } else {
      setAllocations([]);
    }

    setSelectedBolaoId((current) => (list.some((b) => b.id === current) ? current : (list[0]?.id ?? '')));
    setLoading(false);
  }, [selectedBranch]);

  useEffect(() => { fetchBranchesAndOperators(); }, [fetchBranchesAndOperators]);
  useEffect(() => { fetchBoloesAndAllocations(); }, [fetchBoloesAndAllocations]);

  const branchOperators = operators.filter((op) => op.branch_id === selectedBranch);
  const selectedBolao = boloes.find((b) => b.id === selectedBolaoId) ?? null;

  const allocationsFor = (bolaoId: string) => allocations.filter((a) => a.bolao_id === bolaoId);
  const getAllocation = (bolaoId: string, operatorId: string) =>
    allocations.find((a) => a.bolao_id === bolaoId && a.operator_id === operatorId);
  const allocatedSum = (bolaoId: string) => allocationsFor(bolaoId).reduce((s, a) => s + a.shares_allocated, 0);

  const setAllocation = async (bolaoId: string, operatorId: string, shares: number) => {
    const key = `${bolaoId}-${operatorId}`;
    setSavingKey(key);
    setError(null);
    const { error: rpcError } = await supabase.rpc('allocate_bolao_shares', {
      p_bolao_id: bolaoId,
      p_operator_id: operatorId,
      p_shares: shares,
    });
    setSavingKey(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    fetchBoloesAndAllocations();
  };

  const allocateWhole = async (bolao: Bolao, operatorId: string) => {
    const key = `${bolao.id}-whole`;
    setSavingKey(key);
    setError(null);
    const others = allocationsFor(bolao.id).filter((a) => a.operator_id !== operatorId);
    for (const alloc of others) {
      if (alloc.shares_sold > 0) {
        setSavingKey(null);
        setError(`Não é possível alocar o bolão inteiro: ${alloc.operator?.name ?? 'um operador'} já vendeu ${alloc.shares_sold} cota(s) dele.`);
        return;
      }
      const { error: zeroError } = await supabase.rpc('allocate_bolao_shares', {
        p_bolao_id: bolao.id, p_operator_id: alloc.operator_id, p_shares: 0,
      });
      if (zeroError) { setSavingKey(null); setError(zeroError.message); return; }
    }
    const { error: rpcError } = await supabase.rpc('allocate_bolao_shares', {
      p_bolao_id: bolao.id, p_operator_id: operatorId, p_shares: bolao.total_shares,
    });
    setSavingKey(null);
    if (rpcError) { setError(rpcError.message); return; }
    fetchBoloesAndAllocations();
  };

  const doTransfer = async () => {
    if (!selectedBolaoId || !transferFrom || !transferTo) {
      setError('Selecione os dois operadores para o repasse.');
      return;
    }
    if (transferFrom === transferTo) {
      setError('Selecione operadores diferentes para o repasse.');
      return;
    }
    setTransferSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('transfer_bolao_shares', {
      p_bolao_id: selectedBolaoId,
      p_from_operator_id: transferFrom,
      p_to_operator_id: transferTo,
      p_shares: Number(transferShares),
    });
    setTransferSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setTransferFrom('');
    setTransferTo('');
    setTransferShares(1);
    fetchBoloesAndAllocations();
  };

  if (loading && branches.length === 0) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  if (branches.length === 0) {
    return (
      <div>
        <PageHeader title="Alocação de Bolões" subtitle="Distribua bolões e cotas entre os operadores de cada filial" />
        <Card>
          <EmptyState icon={<ArrowRightLeft size={48} />} title="Cadastre filiais primeiro" description="Você precisa ter filiais cadastradas antes de alocar bolões." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Alocação de Bolões" subtitle="Escolha um bolão e distribua cotas (ou o bolão inteiro) entre os operadores da filial" />

      {/* Branch selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelectedBranch(b.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              selectedBranch === b.id
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
            }`}
          >
            <Store size={16} /> {b.name}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{error}</p>}

      {branchOperators.length === 0 ? (
        <Card className="mb-6">
          <EmptyState icon={<Users size={48} />} title="Nenhum operador nesta filial" description="Aloque operadores a esta filial antes de distribuir bolões." />
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>
      ) : boloes.length === 0 ? (
        <Card>
          <EmptyState icon={<Ticket size={48} />} title="Nenhum bolão criado para esta filial" description="Crie um bolão para começar a distribuir cotas." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Lista compacta de bolões, já com o valor total à mostra */}
          <div className="lg:col-span-2 space-y-2">
            {boloes.map((bolao) => {
              const perShare = Number(bolao.price) + Number(bolao.service_fee);
              const totalValue = perShare * bolao.total_shares;
              const allocated = allocatedSum(bolao.id);
              const pct = bolao.total_shares > 0 ? Math.round((allocated / bolao.total_shares) * 100) : 0;
              const statusInfo = STATUS_LABELS[bolao.status];
              const isSelected = bolao.id === selectedBolaoId;
              return (
                <button
                  key={bolao.id}
                  onClick={() => setSelectedBolaoId(bolao.id)}
                  className={`w-full text-left border rounded-lg p-3 transition-all ${
                    isSelected ? 'border-brand-400 bg-brand-50 shadow-sm' : 'border-slate-200 bg-white hover:border-brand-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <LotteryIcon slug={bolao.product?.slug ?? ''} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 text-sm truncate">{bolao.product?.name ?? '—'}</span>
                        <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                      </div>
                      <p className="text-xs text-slate-400">Concurso {bolao.contest_number} · {new Date(bolao.draw_date).toLocaleDateString('pt-BR')}</p>
                      <p className="text-sm font-semibold text-brand-700 mt-1">R$ {totalValue.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${allocated >= bolao.total_shares ? 'bg-emerald-500' : allocated > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{allocated}/{bolao.total_shares} cotas alocadas</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Painel de alocação do bolão selecionado */}
          <div className="lg:col-span-3">
            {!selectedBolao ? (
              <Card><EmptyState icon={<Ticket size={48} />} title="Selecione um bolão" description="Escolha um bolão na lista ao lado para distribuir as cotas." /></Card>
            ) : (
              <BolaoAllocationPanel
                bolao={selectedBolao}
                operators={branchOperators}
                getAllocation={getAllocation}
                allocatedSum={allocatedSum(selectedBolao.id)}
                onSetAllocation={setAllocation}
                onAllocateWhole={allocateWhole}
                savingKey={savingKey}
              />
            )}
          </div>
        </div>
      )}

      {/* Repasse entre operadores — já focado no bolão selecionado acima */}
      {selectedBolao && branchOperators.length > 0 && (
        <Card className="p-5 mt-6">
          <div className="flex items-center gap-2 mb-1">
            <Repeat size={18} className="text-slate-400" />
            <h2 className="font-semibold text-slate-900">Repassar cotas entre operadores</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Repassando cotas de <strong>{selectedBolao.product?.name} · Concurso {selectedBolao.contest_number}</strong>.
            Só é possível repassar cotas ainda não vendidas — a comissão passa a ser de quem recebe.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <Select
              label="De (operador)"
              value={transferFrom}
              onChange={setTransferFrom}
              placeholder="Selecione"
              options={branchOperators.map((op) => ({ value: op.id, label: op.name }))}
            />
            <Select
              label="Para (operador)"
              value={transferTo}
              onChange={setTransferTo}
              placeholder="Selecione"
              options={branchOperators.map((op) => ({ value: op.id, label: op.name }))}
            />
            <Input label="Cotas" type="number" min={1} value={transferShares} onChange={(v) => setTransferShares(Number(v))} />
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={doTransfer} disabled={transferSaving}>{transferSaving ? 'Repassando...' : 'Repassar cotas'}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function BolaoAllocationPanel({
  bolao,
  operators,
  getAllocation,
  allocatedSum,
  onSetAllocation,
  onAllocateWhole,
  savingKey,
}: {
  bolao: Bolao;
  operators: Profile[];
  getAllocation: (bolaoId: string, operatorId: string) => BolaoOperatorAllocation | undefined;
  allocatedSum: number;
  onSetAllocation: (bolaoId: string, operatorId: string, shares: number) => void;
  onAllocateWhole: (bolao: Bolao, operatorId: string) => void;
  savingKey: string | null;
}) {
  const perShare = Number(bolao.price) + Number(bolao.service_fee);
  const totalValue = perShare * bolao.total_shares;
  const allocatedValue = perShare * allocatedSum;
  const unallocated = bolao.total_shares - allocatedSum;
  const unallocatedValue = perShare * unallocated;
  const statusInfo = STATUS_LABELS[bolao.status];
  const locked = bolao.status === 'sold' || bolao.status === 'encalhado';

  return (
    <Card className="overflow-hidden">
      {/* Cabeçalho com todos os valores em destaque — é o que faltava */}
      <div className="px-5 py-4 bg-brand-50 border-b border-brand-100">
        <div className="flex items-center gap-3 mb-3">
          <LotteryIcon slug={bolao.product?.slug ?? ''} size={36} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-brand-900">{bolao.product?.name ?? '—'}</h3>
              <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
            </div>
            <p className="text-xs text-slate-500">
              Concurso {bolao.contest_number} · {bolao.jogos} jogo(s) de {bolao.dezenas} dezenas · Sorteio {new Date(bolao.draw_date).toLocaleDateString('pt-BR')} às {bolao.draw_time?.slice(0, 5)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-lg p-2.5 border border-brand-100">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Valor total</p>
            <p className="text-lg font-bold text-brand-950">R$ {totalValue.toFixed(2)}</p>
            <p className="text-[11px] text-slate-400">{bolao.total_shares} cotas · R$ {perShare.toFixed(2)}/cota</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-brand-100">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Já alocado</p>
            <p className="text-lg font-bold text-emerald-600">R$ {allocatedValue.toFixed(2)}</p>
            <p className="text-[11px] text-slate-400">{allocatedSum} cota(s)</p>
          </div>
          <div className="bg-white rounded-lg p-2.5 border border-brand-100">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">Sem dono</p>
            <p className={`text-lg font-bold ${unallocated > 0 ? 'text-amber-600' : 'text-slate-400'}`}>R$ {unallocatedValue.toFixed(2)}</p>
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

      <div className="p-5 space-y-3">
        {operators.map((op) => {
          const alloc = getAllocation(bolao.id, op.id);
          const key = `${bolao.id}-${op.id}`;
          const opShares = alloc?.shares_allocated ?? 0;
          const opValue = perShare * opShares;
          const maxAllowed = opShares + unallocated;
          const isWhole = opShares === bolao.total_shares;
          return (
            <div key={op.id} className={`border rounded-lg p-3 flex items-center gap-3 ${isWhole ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'}`}>
              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">
                {op.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{op.name}</p>
                <p className="text-xs text-slate-400">{alloc?.shares_sold ?? 0} vendida(s) de {opShares} · R$ {opValue.toFixed(2)}</p>
              </div>
              <div className="w-24">
                <Input
                  type="number"
                  min={alloc?.shares_sold ?? 0}
                  max={maxAllowed}
                  value={opShares}
                  onChange={(v) => onSetAllocation(bolao.id, op.id, Number(v))}
                />
              </div>
              <Button
                size="sm"
                variant={isWhole ? 'accent' : 'secondary'}
                onClick={() => onAllocateWhole(bolao, op.id)}
                disabled={savingKey === `${bolao.id}-whole` || locked}
                title="Alocar o bolão inteiro para este operador"
              >
                {isWhole ? <Check size={14} /> : 'Tudo'}
              </Button>
              {savingKey === key && <span className="text-[11px] text-slate-400 shrink-0">Salvando...</span>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
