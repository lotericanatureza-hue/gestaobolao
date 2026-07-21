import { useEffect, useState, useCallback } from 'react';
import { ArrowRightLeft, Store, Users, Ticket, Repeat } from 'lucide-react';
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
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Repasse entre operadores
  const [transferBolaoId, setTransferBolaoId] = useState('');
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
    setLoading(false);
  }, [selectedBranch]);

  useEffect(() => { fetchBranchesAndOperators(); }, [fetchBranchesAndOperators]);
  useEffect(() => { fetchBoloesAndAllocations(); }, [fetchBoloesAndAllocations]);

  const branchOperators = operators.filter((op) => op.branch_id === selectedBranch);

  const getAllocation = (bolaoId: string, operatorId: string) =>
    allocations.find((a) => a.bolao_id === bolaoId && a.operator_id === operatorId);

  const allocatedSum = (bolaoId: string) =>
    allocations.filter((a) => a.bolao_id === bolaoId).reduce((s, a) => s + a.shares_allocated, 0);

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
    // Zera os outros operadores que ainda não venderam nada deste bolão,
    // pra abrir espaço pro bolão inteiro ir pra um só.
    const others = allocations.filter((a) => a.bolao_id === bolao.id && a.operator_id !== operatorId);
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
    if (!transferBolaoId || !transferFrom || !transferTo) {
      setError('Selecione o bolão e os dois operadores para o repasse.');
      return;
    }
    if (transferFrom === transferTo) {
      setError('Selecione operadores diferentes para o repasse.');
      return;
    }
    setTransferSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('transfer_bolao_shares', {
      p_bolao_id: transferBolaoId,
      p_from_operator_id: transferFrom,
      p_to_operator_id: transferTo,
      p_shares: Number(transferShares),
    });
    setTransferSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
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
      <PageHeader title="Alocação de Bolões" subtitle="Distribua bolões inteiros ou cotas entre os operadores de cada filial" />

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
        <div className="space-y-4 mb-8">
          {boloes.map((bolao) => {
            const allocated = allocatedSum(bolao.id);
            const unallocated = bolao.total_shares - allocated;
            const statusInfo = STATUS_LABELS[bolao.status];
            return (
              <Card key={bolao.id} className="overflow-hidden">
                <div className="px-5 py-3 bg-brand-50 border-b border-brand-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <LotteryIcon slug={bolao.product?.slug ?? ''} size={28} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-brand-900">{bolao.product?.name ?? '—'}</h3>
                        <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        Concurso {bolao.contest_number} · {bolao.total_shares} cotas · Sorteio {new Date(bolao.draw_date).toLocaleDateString('pt-BR')} às {bolao.draw_time?.slice(0, 5)}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    <span className={unallocated > 0 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>
                      {allocated}/{bolao.total_shares} cotas alocadas
                    </span>
                    {unallocated > 0 && <span className="ml-2">({unallocated} sem dono)</span>}
                  </div>
                </div>

                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {branchOperators.map((op) => {
                    const alloc = getAllocation(bolao.id, op.id);
                    const key = `${bolao.id}-${op.id}`;
                    const maxAllowed = (alloc?.shares_allocated ?? 0) + unallocated;
                    return (
                      <div key={op.id} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">
                            {op.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-slate-900 truncate">{op.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            label="Cotas alocadas"
                            type="number"
                            min={alloc?.shares_sold ?? 0}
                            max={maxAllowed}
                            value={alloc?.shares_allocated ?? 0}
                            onChange={(v) => setAllocation(bolao.id, op.id, Number(v))}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                          <span>{alloc?.shares_sold ?? 0} vendida(s)</span>
                          <button
                            type="button"
                            onClick={() => allocateWhole(bolao, op.id)}
                            disabled={savingKey === `${bolao.id}-whole` || bolao.status === 'sold' || bolao.status === 'encalhado'}
                            className="text-brand-600 hover:text-brand-700 font-medium disabled:opacity-40"
                          >
                            Alocar bolão inteiro
                          </button>
                        </div>
                        {savingKey === key && <p className="text-[11px] text-slate-400 mt-1">Salvando...</p>}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Repasse entre operadores */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Repeat size={18} className="text-slate-400" />
          <h2 className="font-semibold text-slate-900">Repassar cotas entre operadores</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Só é possível repassar cotas que ainda não foram vendidas. A comissão passa a ser de quem recebe a cota.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <Select
            label="Bolão"
            value={transferBolaoId}
            onChange={setTransferBolaoId}
            placeholder="Selecione"
            options={boloes.map((b) => ({ value: b.id, label: `${b.product?.name ?? '—'} · Concurso ${b.contest_number}` }))}
          />
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
    </div>
  );
}
