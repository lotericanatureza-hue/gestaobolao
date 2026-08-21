import { useEffect, useState, useCallback } from 'react';
import { Package, ShoppingBag, Ticket, Check, AlertCircle, ChevronDown, ChevronUp, Store } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Badge, Spinner, EmptyState } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import { STATUS_LABELS } from '../lib/bolaoKpis';
import { formatBRL } from '../lib/format';
import type { BolaoBranchAllocation } from '../lib/types';

interface PickSelection {
  bolaoId: string;
  shares: number;
}

export function OperatorStock() {
  const { profile } = useAuth();
  const [branchAllocations, setBranchAllocations] = useState<BolaoBranchAllocation[]>([]);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selections, setSelections] = useState<Map<string, number>>(new Map());
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchStock = useCallback(async () => {
    if (!profile?.branch_id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const [allocRes, branchRes] = await Promise.all([
      supabase
        .from('bolao_branch_allocations')
        .select('*, bolao:boloes(*, product:products(*), branch:branches(*))')
        .eq('branch_id', profile.branch_id)
        .order('created_at', { ascending: false }),
      supabase
        .from('branches')
        .select('name')
        .eq('id', profile.branch_id)
        .maybeSingle(),
    ]);
    if (allocRes.error) { setError('Erro ao carregar estoque: ' + allocRes.error.message); }
    else { setBranchAllocations((allocRes.data ?? []) as BolaoBranchAllocation[]); }
    setBranchName(branchRes.data?.name ?? null);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    fetchStock();
    const channel = supabase
      .channel('operator-stock-branch-allocations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bolao_branch_allocations' }, () => fetchStock())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boloes' }, () => fetchStock())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchStock]);

  const availableAllocations = branchAllocations.filter((a) => {
    const b = a.bolao;
    if (!b) return false;
    if (b.status === 'sold') return false;
    const available = a.shares_allocated - a.shares_picked;
    return available > 0;
  });

  const filtered = availableAllocations.filter((a) => {
    const b = a.bolao;
    if (!b) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return b.product?.name.toLowerCase().includes(q) || b.contest_number.includes(q);
  });

  const setShares = (bolaoId: string, shares: number) => {
    setSelections((prev) => {
      const next = new Map(prev);
      if (shares <= 0) { next.delete(bolaoId); }
      else { next.set(bolaoId, shares); }
      return next;
    });
  };

  const selectedItems: PickSelection[] = Array.from(selections.entries())
    .map(([bolaoId, shares]) => ({ bolaoId, shares }))
    .filter((s) => s.shares > 0);

  const totalSelectedValue = selectedItems.reduce((sum, s) => {
    const alloc = branchAllocations.find((a) => a.bolao_id === s.bolaoId);
    if (!alloc?.bolao) return sum;
    const perShare = Number(alloc.bolao.price) + Number(alloc.bolao.service_fee);
    return sum + perShare * s.shares;
  }, 0);

  const totalSelectedShares = selectedItems.reduce((s, item) => s + item.shares, 0);

  const confirmPick = async () => {
    if (selectedItems.length === 0) return;
    setPicking(true);
    setPickError(null);
    setSuccessMsg(null);
    let errorMsg: string | null = null;
    let successCount = 0;
    for (const item of selectedItems) {
      const { error: rpcError } = await supabase.rpc('pick_shares_from_branch', {
        p_bolao_id: item.bolaoId, p_shares: item.shares,
      });
      if (rpcError) {
        errorMsg = rpcError.message;
        break;
      }
      successCount++;
    }
    setPicking(false);
    if (errorMsg) {
      setPickError(errorMsg + (successCount > 0 ? ` (${successCount} bolão(ões) pegos antes do erro.)` : ''));
    } else {
      setSuccessMsg(`${successCount} bolão(ões) pego(s) com sucesso! ${totalSelectedShares} cota(s) adicionadas às suas vendas.`);
      setSelections(new Map());
    }
    fetchStock();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  if (!profile?.branch_id) {
    return (
      <div>
        <PageHeader title="Estoque da Filial" />
        <Card>
          <EmptyState icon={<AlertCircle size={48} />} title="Você não está alocado em nenhuma filial" description="Solicite ao administrador que aloque você em uma filial para acessar o estoque de bolões." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Estoque da Filial" subtitle="Pegue cotas dos bolões disponíveis no estoque da sua filial para vender" />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 text-emerald-700 text-sm flex items-center gap-2">
          <Check size={16} /> {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-500 hover:text-emerald-700">×</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Store size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Sua Filial</p>
          </div>
          <p className="text-lg font-bold text-brand-950">{branchName ?? '—'}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Package size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Bolões em Estoque</p>
          </div>
          <p className="text-2xl font-bold text-brand-950">{availableAllocations.length}</p>
          <p className="text-sm text-slate-500 mt-1">disponíveis para pegar</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><ShoppingBag size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Cotas Selecionadas</p>
          </div>
          <p className="text-2xl font-bold text-brand-950">{totalSelectedShares}</p>
          <p className="text-sm text-slate-500 mt-1">R$ {formatBRL(totalSelectedValue)}</p>
        </Card>
      </div>

      <div className="mb-4"><Input value={search} onChange={setSearch} placeholder="Buscar por produto ou concurso..." /></div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<Package size={48} />}
            title="Nenhum bolão disponível no estoque"
            description="Quando o administrador alocar bolões para sua filial, eles aparecerão aqui para você pegar cotas." />
        </Card>
      ) : (
        <div className="space-y-3 mb-6">
          {filtered.map((a) => {
            const b = a.bolao;
            if (!b) return null;
            const perShare = Number(b.price) + Number(b.service_fee);
            const available = a.shares_allocated - a.shares_picked;
            const statusInfo = STATUS_LABELS[b.status];
            const selectedShares = selections.get(b.id) ?? 0;
            const isExpanded = expandedId === b.id;
            const drawDateFormatted = b.draw_date.split('-').reverse().join('/');
            return (
              <Card key={a.id} className="p-4">
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
                        <span>Sorteio: {drawDateFormatted} às {b.draw_time?.slice(0, 5)}</span>
                      </div>
                      <button onClick={() => setExpandedId(isExpanded ? null : b.id)}
                        className="text-xs text-brand-600 hover:text-brand-700 mt-1 flex items-center gap-1">
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        Detalhes
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Valor por cota</p>
                      <p className="text-sm font-semibold text-brand-700">R$ {formatBRL(perShare)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Disponível</p>
                      <p className="text-sm font-semibold text-amber-600">{available} cota(s)</p>
                    </div>
                    <div className="w-28">
                      <label className="text-[11px] text-slate-400 block mb-0.5">Pegar</label>
                      <Input type="number" min={0} max={available} value={selectedShares || ''}
                        onChange={(v) => setShares(b.id, Math.min(Number(v), available))} />
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div className="bg-brand-50 rounded-lg p-2.5">
                      <p className="text-slate-500 text-xs">Cotas no estoque</p>
                      <p className="font-bold text-brand-950">{a.shares_allocated}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2.5">
                      <p className="text-slate-500 text-xs">Pegas por colegas</p>
                      <p className="font-bold text-slate-700">{a.shares_picked}</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2.5">
                      <p className="text-slate-500 text-xs">Disponível agora</p>
                      <p className="font-bold text-amber-700">{available}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-2.5">
                      <p className="text-slate-500 text-xs">Valor total em estoque</p>
                      <p className="font-bold text-emerald-700">R$ {formatBRL(perShare * a.shares_allocated)}</p>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {selectedItems.length > 0 && (
        <div className="sticky bottom-0 bg-white border-t border-slate-200 shadow-lg p-4 -mx-4 lg:-mx-8 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-brand-950">{selectedItems.length} bolão(ões) · {totalSelectedShares} cota(s)</p>
              <p className="text-xs text-slate-400">Valor total: R$ {formatBRL(totalSelectedValue)}</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => setSelections(new Map())}>Limpar</Button>
              <Button onClick={confirmPick} disabled={picking}>
                <Ticket size={16} /> {picking ? 'Pegando cotas...' : 'Pegar cotas e vender'}
              </Button>
            </div>
          </div>
          {pickError && <p className="text-xs text-red-600 mt-2">{pickError}</p>}
        </div>
      )}
    </div>
  );
}
