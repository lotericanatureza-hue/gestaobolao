import { useEffect, useState, useCallback } from 'react';
import { Ticket, Plus, Pencil, Trash2, Copy, DollarSign, Receipt, Lock, Unlock, ChevronDown, ChevronRight, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, MoneyInput, Select, Modal, Badge, Spinner, EmptyState } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import { formatBRL, formatDateBR, parseBRL, maskBRL } from '../lib/format';
import type { Product, Profile, Branch, FinBolaoClosing, BolaoClosingItem, BolaoClosingPixExternal, BolaoClosingOwed } from '../lib/types';

const todayStr = () => new Date().toISOString().split('T')[0];

interface ItemForm {
  id: string;
  product_id: string;
  product_name: string;
  slug: string;
  shares: string;
  price_per_share: string;
  fee_per_share: string;
}

const emptyItem = (): ItemForm => ({
  id: crypto.randomUUID(),
  product_id: '',
  product_name: '',
  slug: '',
  shares: '1',
  price_per_share: '',
  fee_per_share: '',
});

export function FinancialBolaoClosing() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isSupervisor = profile?.role === 'supervisor';
  const canManageAll = isAdmin || isSupervisor;

  const [products, setProducts] = useState<Product[]>([]);
  const [closings, setClosings] = useState<FinBolaoClosing[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [fDate, setFDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinBolaoClosing | null>(null);
  const [formDate, setFormDate] = useState(todayStr());
  const [formOperatorId, setFormOperatorId] = useState('');
  const [items, setItems] = useState<ItemForm[]>([emptyItem()]);
  const [pixExternals, setPixExternals] = useState<BolaoClosingPixExternal[]>([]);
  const [owedAmounts, setOwedAmounts] = useState<BolaoClosingOwed[]>([]);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('products').select('*').eq('active', true).order('name').then(({ data }) => {
      setProducts((data ?? []) as Product[]);
    });
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      const list = (data ?? []) as Branch[];
      setBranches(list);
      if (isAdmin) {
        setSelectedBranch('');
      } else {
        setSelectedBranch(profile?.branch_id ?? '');
      }
    });
  }, [profile, isAdmin]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('fin_bolao_closing')
      .select('*, operator:profiles(*), branch:branches(*)')
      .order('closing_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (!isAdmin) {
      const branchId = profile?.branch_id ?? '';
      if (!branchId) { setLoading(false); return; }
      q = q.eq('branch_id', branchId);
    } else if (selectedBranch) {
      q = q.eq('branch_id', selectedBranch);
    }
    const { data } = await q;
    setClosings((data ?? []) as FinBolaoClosing[]);

    // Fetch operators for admin/supervisor selection
    if (canManageAll) {
      let opQ = supabase.from('profiles').select('*').eq('role', 'operator').eq('active', true).order('name');
      if (!isAdmin && profile?.branch_id) opQ = opQ.eq('branch_id', profile.branch_id);
      else if (isAdmin && selectedBranch) opQ = opQ.eq('branch_id', selectedBranch);
      const { data: ops } = await opQ;
      setOperators((ops ?? []) as Profile[]);
    }
    setLoading(false);
  }, [profile, isAdmin, isSupervisor, selectedBranch, canManageAll]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  const openNew = () => {
    setEditing(null);
    setFormDate(fDate);
    setFormOperatorId(canManageAll ? '' : (profile?.id ?? ''));
    setItems([emptyItem()]);
    setPixExternals([]);
    setOwedAmounts([]);
    setNotes('');
    setStatus('open');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: FinBolaoClosing) => {
    setEditing(c);
    setFormDate(c.closing_date);
    setFormOperatorId(c.operator_id);
    setItems(c.items.length > 0 ? c.items.map((it) => ({
      id: it.id,
      product_id: it.product_id,
      product_name: it.product_name,
      slug: it.slug,
      shares: String(it.shares),
      price_per_share: String(it.price_per_share),
      fee_per_share: String(it.fee_per_share),
    })) : [emptyItem()]);
    setPixExternals(c.pix_externals ?? []);
    setOwedAmounts(c.owed_amounts ?? []);
    setNotes(c.notes ?? '');
    setStatus(c.status);
    setError(null);
    setModalOpen(true);
  };

  const onProductChange = (itemId: string, productId: string) => {
    const p = products.find((pr) => pr.id === productId);
    setItems((prev) => prev.map((it) =>
      it.id === itemId
        ? {
            ...it,
            product_id: productId,
            product_name: p?.name ?? '',
            slug: p?.slug ?? '',
            price_per_share: p ? String(p.base_price) : it.price_per_share,
            fee_per_share: p ? String(p.service_fee) : it.fee_per_share,
          }
        : it
    ));
  };

  const updateItem = (itemId: string, field: keyof ItemForm, value: string) => {
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, [field]: value } : it));
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (itemId: string) => setItems((prev) => prev.length > 1 ? prev.filter((it) => it.id !== itemId) : prev);

  const addPix = () => setPixExternals([...pixExternals, { id: crypto.randomUUID(), description: '', amount: 0 }]);
  const updatePix = (id: string, field: 'description' | 'amount', value: string | number) =>
    setPixExternals(pixExternals.map((p) => p.id === id ? { ...p, [field]: value } : p));
  const removePix = (id: string) => setPixExternals(pixExternals.filter((p) => p.id !== id));
  const totalPix = pixExternals.reduce((s, p) => s + Number(p.amount), 0);

  const addOwed = () => setOwedAmounts([...owedAmounts, { id: crypto.randomUUID(), description: '', amount: 0 }]);
  const updateOwed = (id: string, field: 'description' | 'amount', value: string | number) =>
    setOwedAmounts(owedAmounts.map((o) => o.id === id ? { ...o, [field]: value } : o));
  const removeOwed = (id: string) => setOwedAmounts(owedAmounts.filter((o) => o.id !== id));
  const totalOwed = owedAmounts.reduce((s, o) => s + Number(o.amount), 0);

  // Computed totals from items
  const computedItems: BolaoClosingItem[] = items.map((it) => {
    const shares = parseInt(it.shares) || 0;
    const price = parseBRL(it.price_per_share);
    const fee = parseBRL(it.fee_per_share);
    const total = (price + fee) * shares;
    return {
      id: it.id,
      product_id: it.product_id,
      product_name: it.product_name,
      slug: it.slug,
      shares,
      price_per_share: price,
      fee_per_share: fee,
      total,
    };
  });
  const totalCotas = computedItems.reduce((s, it) => s + it.shares, 0);
  const totalValue = computedItems.reduce((s, it) => s + it.total, 0);
  const totalFee = computedItems.reduce((s, it) => s + (it.fee_per_share * it.shares), 0);

  const save = async () => {
    if (saving) return;
    const validItems = computedItems.filter((it) => it.product_id && it.shares > 0);
    if (validItems.length === 0) { setError('Adicione pelo menos um produto com cotas.'); return; }
    const opId = canManageAll ? formOperatorId : (profile?.id ?? '');
    if (!opId) { setError('Selecione o operador.'); return; }

    // Determine branch_id from the selected operator
    let branchId: string;
    if (isAdmin && selectedBranch) {
      branchId = selectedBranch;
    } else if (canManageAll && !isAdmin) {
      branchId = profile?.branch_id ?? '';
    } else {
      branchId = profile?.branch_id ?? '';
    }

    // If admin selected an operator, get operator's branch
    if (canManageAll && formOperatorId) {
      const op = operators.find((o) => o.id === formOperatorId);
      if (op?.branch_id) branchId = op.branch_id;
    }
    if (!branchId) { setError('Não foi possível determinar a filial.'); return; }

    setSaving(true);
    setError(null);

    const payload = {
      operator_id: opId,
      branch_id: branchId,
      closing_date: formDate,
      items: validItems as unknown as Record<string, unknown>[],
      total_cotas: totalCotas,
      total_value: totalValue,
      total_fee: totalFee,
      pix_externals: pixExternals as unknown as Record<string, unknown>[],
      total_pix_externals: totalPix,
      owed_amounts: owedAmounts as unknown as Record<string, unknown>[],
      total_owed: totalOwed,
      notes: notes.trim() || null,
      status,
    };

    const { error: saveError } = editing
      ? await supabase.from('fin_bolao_closing').update(payload).eq('id', editing.id)
      : await supabase.from('fin_bolao_closing').insert(payload);

    if (saveError) {
      setError('Erro ao salvar: ' + saveError.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setModalOpen(false);
    fetchData();
  };

  const removeClosing = async (c: FinBolaoClosing) => {
    if (!confirm(`Excluir o fechamento de ${formatDateBR(c.closing_date)}?`)) return;
    await supabase.from('fin_bolao_closing').delete().eq('id', c.id);
    fetchData();
  };

  const toggleStatus = async (c: FinBolaoClosing) => {
    const newStatus = c.status === 'open' ? 'closed' : 'open';
    await supabase.from('fin_bolao_closing').update({ status: newStatus }).eq('id', c.id);
    fetchData();
  };

  const duplicateClosing = async (c: FinBolaoClosing) => {
    const payload = {
      operator_id: c.operator_id,
      branch_id: c.branch_id,
      closing_date: todayStr(),
      items: c.items as unknown as Record<string, unknown>[],
      total_cotas: c.total_cotas,
      total_value: c.total_value,
      total_fee: c.total_fee,
      pix_externals: c.pix_externals as unknown as Record<string, unknown>[],
      total_pix_externals: c.total_pix_externals,
      owed_amounts: c.owed_amounts as unknown as Record<string, unknown>[],
      total_owed: c.total_owed,
      notes: c.notes,
      status: 'open' as const,
    };
    await supabase.from('fin_bolao_closing').insert(payload);
    fetchData();
  };

  // Filter by selected date
  const dateClosings = closings.filter((c) => c.closing_date === fDate);
  const dayTotalValue = dateClosings.reduce((s, c) => s + Number(c.total_value), 0);
  const dayTotalCotas = dateClosings.reduce((s, c) => s + Number(c.total_cotas), 0);
  const dayTotalFee = dateClosings.reduce((s, c) => s + Number(c.total_fee), 0);
  const dayTotalPix = dateClosings.reduce((s, c) => s + Number(c.total_pix_externals), 0);
  const dayTotalOwed = dateClosings.reduce((s, c) => s + Number(c.total_owed), 0);

  if (loading && !closings.length) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  const operatorName = (id: string) => {
    const c = closings.find((c) => c.operator_id === id);
    return c?.operator?.name ?? operators.find((o) => o.id === id)?.name ?? '—';
  };

  return (
    <div>
      <PageHeader
        title="Fechamento de Bolão"
        subtitle="Fechamento diário de bolão por operador — produtos, cotas, taxas, pix externo e valores devidos"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <Select value={selectedBranch} onChange={setSelectedBranch} options={[{ value: '', label: 'Todas as filiais' }, ...branchOptions]} />
            )}
            <Input type="date" value={fDate} onChange={setFDate} />
            <Button onClick={openNew}><Plus size={18} /> Novo Fechamento</Button>
          </div>
        }
      />

      {/* Day summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Fechamentos do Dia</p>
          <p className="text-xl font-bold text-brand-950">{dateClosings.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Total Cotas</p>
          <p className="text-xl font-bold text-brand-950">{totalCotas}</p>
        </Card>
        <Card className="p-4">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Valor Total</p>
          <p className="text-xl font-bold text-brand-700">R$ {formatBRL(dayTotalValue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Total Taxas</p>
          <p className="text-xl font-bold text-emerald-600">R$ {formatBRL(dayTotalFee)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Pix Externos</p>
          <p className="text-xl font-bold text-accent-600">R$ {formatBRL(dayTotalPix)}</p>
        </Card>
      </div>

      {closings.length === 0 ? (
        <Card><EmptyState icon={<Ticket size={48} />} title="Nenhum fechamento" description="Clique em 'Novo Fechamento' para registrar o fechamento de bolão do dia." /></Card>
      ) : (
        <div className="space-y-3">
          {closings.map((c) => {
            const isExpanded = expandedId === c.id;
            const canEdit = isAdmin || (isSupervisor && c.branch_id === profile?.branch_id) || (c.operator_id === profile?.id);
            return (
              <Card key={c.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                      <Ticket size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-slate-900">{formatDateBR(c.closing_date)}</h3>
                        <Badge color={c.status === 'closed' ? 'blue' : 'amber'}>
                          {c.status === 'closed' ? <><Lock size={11} className="mr-1" />Fechado</> : <><Unlock size={11} className="mr-1" />Aberto</>}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <User size={12} /> {operatorName(c.operator_id)}
                        {c.branch && <span>· {c.branch.name}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-brand-700">{c.total_cotas} cotas</p>
                      <p className="text-xs text-slate-500">R$ {formatBRL(Number(c.total_value))}</p>
                    </div>
                    {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 p-4 space-y-4">
                    {/* Items table */}
                    <div className="overflow-x-auto border border-slate-100 rounded-lg">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                            <th className="px-4 py-2 font-medium">Produto</th>
                            <th className="px-4 py-2 font-medium text-right">Cotas</th>
                            <th className="px-4 py-2 font-medium text-right">Valor cota</th>
                            <th className="px-4 py-2 font-medium text-right">Taxa cota</th>
                            <th className="px-4 py-2 font-medium text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.items.map((it, i) => (
                            <tr key={i} className="border-b border-slate-50">
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <LotteryIcon slug={it.slug} size={20} />
                                  <span className="font-medium text-slate-900">{it.product_name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right text-slate-600">{it.shares}</td>
                              <td className="px-4 py-2 text-right text-slate-600">R$ {formatBRL(Number(it.price_per_share))}</td>
                              <td className="px-4 py-2 text-right text-slate-600">R$ {formatBRL(Number(it.fee_per_share))}</td>
                              <td className="px-4 py-2 text-right font-semibold text-brand-700">R$ {formatBRL(Number(it.total))}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 font-semibold">
                            <td className="px-4 py-2">Totais</td>
                            <td className="px-4 py-2 text-right">{c.total_cotas}</td>
                            <td className="px-4 py-2 text-right text-slate-500">—</td>
                            <td className="px-4 py-2 text-right text-emerald-600">R$ {formatBRL(Number(c.total_fee))}</td>
                            <td className="px-4 py-2 text-right text-brand-700">R$ {formatBRL(Number(c.total_value))}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Pix externals + owed */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {c.pix_externals.length > 0 && (
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1"><DollarSign size={14} /> Pix Externos</p>
                          {c.pix_externals.map((p, i) => (
                            <div key={i} className="flex justify-between text-sm py-0.5">
                              <span className="text-slate-600">{p.description || '—'}</span>
                              <span className="font-medium text-slate-900">R$ {formatBRL(Number(p.amount))}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm pt-1.5 mt-1 border-t border-slate-200 font-semibold">
                            <span>Total</span>
                            <span className="text-accent-600">R$ {formatBRL(Number(c.total_pix_externals))}</span>
                          </div>
                        </div>
                      )}
                      {c.owed_amounts.length > 0 && (
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1"><Receipt size={14} /> Valores Devidos</p>
                          {c.owed_amounts.map((o, i) => (
                            <div key={i} className="flex justify-between text-sm py-0.5">
                              <span className="text-slate-600">{o.description || '—'}</span>
                              <span className="font-medium text-slate-900">R$ {formatBRL(Number(o.amount))}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm pt-1.5 mt-1 border-t border-slate-200 font-semibold">
                            <span>Total</span>
                            <span className="text-red-600">R$ {formatBRL(Number(c.total_owed))}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {c.notes && <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3"><strong>Obs:</strong> {c.notes}</p>}

                    {canEdit && (
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => duplicateClosing(c)}><Copy size={14} /> Duplicar</Button>
                        <Button size="sm" variant="secondary" onClick={() => toggleStatus(c)}>
                          {c.status === 'closed' ? <><Unlock size={14} /> Reabrir</> : <><Lock size={14} /> Fechar</>}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(c)}><Pencil size={14} /> Editar</Button>
                        <Button size="sm" variant="danger" onClick={() => removeClosing(c)}><Trash2 size={14} /> Excluir</Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Fechamento' : 'Novo Fechamento de Bolão'} maxWidth="max-w-3xl">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Data do Fechamento" type="date" value={formDate} onChange={setFormDate} required />
            {canManageAll ? (
              <Select
                label="Operador"
                value={formOperatorId}
                onChange={setFormOperatorId}
                options={operators.map((o) => ({ value: o.id, label: o.name }))}
                placeholder="Selecione o operador"
                required
              />
            ) : (
              <div>
                <span className="block text-sm font-medium text-slate-700 mb-1.5">Operador</span>
                <p className="text-sm font-medium text-slate-900 bg-slate-50 rounded-lg px-3 py-2">{profile?.name}</p>
              </div>
            )}
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-sm font-medium text-slate-700">Produtos / Jogos</span>
              <Button size="sm" variant="secondary" onClick={addItem}><Plus size={14} /> Adicionar produto</Button>
            </div>
            <div className="space-y-3">
              {items.map((it) => (
                <div key={it.id} className="flex flex-col sm:flex-row sm:items-end gap-2 bg-slate-50 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <label className="text-[11px] text-slate-500 block mb-0.5">Produto</label>
                    <select
                      value={it.product_id}
                      onChange={(e) => onProductChange(it.id, e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    >
                      <option value="">Selecione...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-20">
                    <label className="text-[11px] text-slate-500 block mb-0.5">Cotas</label>
                    <input
                      type="number"
                      min={1}
                      value={it.shares}
                      onChange={(e) => updateItem(it.id, 'shares', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                  </div>
                  <div className="w-28">
                    <label className="text-[11px] text-slate-500 block mb-0.5">Valor cota</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={it.price_per_share ? maskBRL(String(Math.round(parseBRL(it.price_per_share) * 100))) : ''}
                      onChange={(e) => updateItem(it.id, 'price_per_share', e.target.value)}
                      placeholder="R$ 0,00"
                      className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                  </div>
                  <div className="w-28">
                    <label className="text-[11px] text-slate-500 block mb-0.5">Taxa cota</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={it.fee_per_share ? maskBRL(String(Math.round(parseBRL(it.fee_per_share) * 100))) : ''}
                      onChange={(e) => updateItem(it.id, 'fee_per_share', e.target.value)}
                      placeholder="R$ 0,00"
                      className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                  </div>
                  <div className="w-28">
                    <label className="text-[11px] text-slate-500 block mb-0.5">Total</label>
                    <p className="text-sm font-bold text-brand-700 py-2">
                      R$ {formatBRL((parseBRL(it.price_per_share) + parseBRL(it.fee_per_share)) * (parseInt(it.shares) || 0))}
                    </p>
                  </div>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(it.id)} className="text-slate-400 hover:text-red-500 p-2 shrink-0" title="Remover">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {/* Items summary */}
            <div className="mt-3 bg-brand-50 rounded-lg p-3 flex flex-wrap justify-between gap-4 text-sm">
              <span className="text-slate-600">Total de cotas: <strong className="text-brand-950">{totalCotas}</strong></span>
              <span className="text-slate-600">Total taxas: <strong className="text-emerald-600">R$ {formatBRL(totalFee)}</strong></span>
              <span className="text-slate-600">Valor total: <strong className="text-brand-700">R$ {formatBRL(totalValue)}</strong></span>
            </div>
          </div>

          {/* Pix Externos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-sm font-medium text-slate-700">Pix Externos</span>
              <Button size="sm" variant="secondary" onClick={addPix}><Plus size={14} /> Adicionar</Button>
            </div>
            {pixExternals.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Nenhum pix externo adicionado.</p>
            ) : (
              <div className="space-y-2">
                {pixExternals.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={p.description}
                      onChange={(e) => updatePix(p.id, 'description', e.target.value)}
                      placeholder="Descrição"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={p.amount ? maskBRL(String(Math.round(Number(p.amount) * 100))) : ''}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        updatePix(p.id, 'amount', digits ? Number(digits) / 100 : 0);
                      }}
                      placeholder="R$ 0,00"
                      className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm text-right focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                    <button onClick={() => removePix(p.id)} className="text-slate-400 hover:text-red-500 p-2"><Trash2 size={16} /></button>
                  </div>
                ))}
                <div className="flex justify-end text-sm font-medium text-slate-700 pt-1">Total Pix: R$ {formatBRL(totalPix)}</div>
              </div>
            )}
          </div>

          {/* Valores Devidos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-sm font-medium text-slate-700">Valores Devidos</span>
              <Button size="sm" variant="secondary" onClick={addOwed}><Plus size={14} /> Adicionar</Button>
            </div>
            {owedAmounts.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Nenhum valor devido adicionado.</p>
            ) : (
              <div className="space-y-2">
                {owedAmounts.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={o.description}
                      onChange={(e) => updateOwed(o.id, 'description', e.target.value)}
                      placeholder="Descrição"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={o.amount ? maskBRL(String(Math.round(Number(o.amount) * 100))) : ''}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        updateOwed(o.id, 'amount', digits ? Number(digits) / 100 : 0);
                      }}
                      placeholder="R$ 0,00"
                      className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm text-right focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                    <button onClick={() => removeOwed(o.id)} className="text-slate-400 hover:text-red-500 p-2"><Trash2 size={16} /></button>
                  </div>
                ))}
                <div className="flex justify-end text-sm font-medium text-slate-700 pt-1">Total Devido: R$ {formatBRL(totalOwed)}</div>
              </div>
            )}
          </div>

          <Input label="Observações" value={notes} onChange={setNotes} placeholder="Notas adicionais" />
          <Select label="Status" value={status} onChange={(v) => setStatus(v as 'open' | 'closed')} options={[{ value: 'open', label: 'Aberto' }, { value: 'closed', label: 'Fechado' }]} />

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
