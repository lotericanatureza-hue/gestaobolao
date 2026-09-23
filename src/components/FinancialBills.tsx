import { useEffect, useState, useCallback } from 'react';
import { Receipt, Plus, Pencil, Trash2, Search, Copy, CheckCircle, Clock, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from './ui';
import { formatBRL, formatDateBR } from '../lib/format';
import type { FinBill, FinCategory, FinSubcategory, FinPaymentSource, Branch } from '../lib/types';

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const now = new Date();

const emptyForm = {
  description: '',
  type: 'expense' as 'expense' | 'income',
  category_id: '',
  subcategory_id: '',
  amount: '',
  origin: '',
  payment_source_id: '',
  due_date: '',
  payment_date: '',
  status: 'pending' as 'pending' | 'paid',
  month_ref: String(now.getMonth() + 1),
  year_ref: String(now.getFullYear()),
  recurring: false,
  notes: '',
};

export function FinancialBills() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [bills, setBills] = useState<FinBill[]>([]);
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [subcategories, setSubcategories] = useState<FinSubcategory[]>([]);
  const [paymentSources, setPaymentSources] = useState<FinPaymentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinBill | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replicating, setReplicating] = useState(false);

  // Filters
  const [fSearch, setFSearch] = useState('');
  const [fMonth, setFMonth] = useState('');
  const [fYear, setFYear] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fSource, setFSource] = useState('');
  const [fType, setFType] = useState('');

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      const list = (data ?? []) as Branch[];
      setBranches(list);
      if (isAdmin) {
        setSelectedBranch(list[0]?.id ?? '');
      } else {
        setSelectedBranch(profile?.branch_id ?? '');
      }
    });
  }, [profile, isAdmin]);

  const fetchData = useCallback(async () => {
    if (!selectedBranch) { setLoading(false); return; }
    setLoading(true);
    const [billRes, catRes, subRes, psRes] = await Promise.all([
      supabase.from('fin_bills').select('*, category:fin_categories(*), subcategory:fin_subcategories(*), payment_source:fin_payment_sources(*)').eq('branch_id', selectedBranch).order('year_ref', { ascending: false }).order('month_ref', { ascending: false }).order('due_date', { ascending: false }),
      supabase.from('fin_categories').select('*').eq('branch_id', selectedBranch).order('name'),
      supabase.from('fin_subcategories').select('*').eq('branch_id', selectedBranch).order('name'),
      supabase.from('fin_payment_sources').select('*').eq('branch_id', selectedBranch).order('name'),
    ]);
    setBills((billRes.data ?? []) as FinBill[]);
    setCategories((catRes.data ?? []) as FinCategory[]);
    setSubcategories((subRes.data ?? []) as FinSubcategory[]);
    setPaymentSources((psRes.data ?? []) as FinPaymentSource[]);
    setLoading(false);
  }, [selectedBranch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));
  const filteredSubs = subcategories.filter((s) => s.category_id === form.category_id);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (b: FinBill) => {
    setEditing(b);
    setForm({
      description: b.description,
      type: b.type,
      category_id: b.category_id ?? '',
      subcategory_id: b.subcategory_id ?? '',
      amount: String(b.amount),
      origin: b.origin ?? '',
      payment_source_id: b.payment_source_id ?? '',
      due_date: b.due_date ?? '',
      payment_date: b.payment_date ?? '',
      status: b.status,
      month_ref: String(b.month_ref),
      year_ref: String(b.year_ref),
      recurring: b.recurring,
      notes: b.notes ?? '',
    });
    setError(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.description.trim()) { setError('Descrição é obrigatória.'); return; }
    const amount = parseFloat(form.amount.replace(',', '.'));
    if (isNaN(amount)) { setError('Valor inválido.'); return; }
    setSaving(true);
    setError(null);
    const payload = {
      branch_id: selectedBranch,
      description: form.description.trim(),
      type: form.type,
      category_id: form.category_id || null,
      subcategory_id: form.subcategory_id || null,
      amount,
      origin: form.origin.trim() || null,
      payment_source_id: form.payment_source_id || null,
      due_date: form.due_date || null,
      payment_date: form.payment_date || null,
      status: form.status,
      month_ref: parseInt(form.month_ref),
      year_ref: parseInt(form.year_ref),
      recurring: form.recurring,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await supabase.from('fin_bills').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('fin_bills').insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    fetchData();
  };

  const remove = async (b: FinBill) => {
    if (!confirm(`Excluir "${b.description}"?`)) return;
    await supabase.from('fin_bills').delete().eq('id', b.id);
    fetchData();
  };

  const togglePaid = async (b: FinBill) => {
    const newStatus = b.status === 'paid' ? 'pending' : 'paid';
    const update: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'paid' && !b.payment_date) {
      update.payment_date = new Date().toISOString().split('T')[0];
    }
    await supabase.from('fin_bills').update(update).eq('id', b.id);
    fetchData();
  };

  const replicateMonth = async () => {
    const monthBills = bills.filter((b) => b.month_ref === parseInt(form.month_ref) && b.year_ref === parseInt(form.year_ref));
    if (monthBills.length === 0) {
      setError('Nenhuma conta encontrada no mês selecionado para replicar.');
      return;
    }
    const nextMonth = parseInt(form.month_ref) === 12 ? 1 : parseInt(form.month_ref) + 1;
    const nextYear = parseInt(form.month_ref) === 12 ? parseInt(form.year_ref) + 1 : parseInt(form.year_ref);
    if (!confirm(`Replicar ${monthBills.length} conta(s) de ${monthNames[parseInt(form.month_ref) - 1]}/${form.year_ref} para ${monthNames[nextMonth - 1]}/${nextYear}?`)) return;
    setReplicating(true);
    const newBills = monthBills.map((b) => ({
      branch_id: b.branch_id,
      description: b.description,
      type: b.type,
      category_id: b.category_id,
      subcategory_id: b.subcategory_id,
      amount: b.amount,
      origin: b.origin,
      payment_source_id: b.payment_source_id,
      due_date: b.due_date ? b.due_date : null,
      payment_date: null,
      status: 'pending' as const,
      month_ref: nextMonth,
      year_ref: nextYear,
      recurring: b.recurring,
      notes: b.notes,
    }));
    await supabase.from('fin_bills').insert(newBills);
    setReplicating(false);
    fetchData();
  };

  // Filter bills
  const filtered = bills.filter((b) => {
    if (fSearch && !b.description.toLowerCase().includes(fSearch.toLowerCase())) return false;
    if (fMonth && b.month_ref !== parseInt(fMonth)) return false;
    if (fYear && b.year_ref !== parseInt(fYear)) return false;
    if (fCategory && b.category_id !== fCategory) return false;
    if (fSource && b.payment_source_id !== fSource) return false;
    if (fType && b.type !== fType) return false;
    return true;
  });

  const totalExpenses = filtered.filter((b) => b.type === 'expense').reduce((s, b) => s + Number(b.amount), 0);
  const totalIncome = filtered.filter((b) => b.type === 'income').reduce((s, b) => s + Number(b.amount), 0);
  const totalPending = filtered.filter((b) => b.status === 'pending' && b.type === 'expense').reduce((s, b) => s + Number(b.amount), 0);

  if (loading && !bills.length) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Contas a Pagar e Receber"
        subtitle="Controle mensal/anual de contas por filial"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Select value={selectedBranch} onChange={setSelectedBranch} options={branchOptions} placeholder="Selecionar filial" />
            )}
            <Button onClick={openNew}><Plus size={18} /> Nova Conta</Button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center"><ArrowDownCircle size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Despesas</p>
          </div>
          <p className="text-2xl font-bold text-red-600">R$ {formatBRL(totalExpenses)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><ArrowUpCircle size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Receitas</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">R$ {formatBRL(totalIncome)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Clock size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Pendentes</p>
          </div>
          <p className="text-2xl font-bold text-amber-600">R$ {formatBRL(totalPending)}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={fSearch}
              onChange={(e) => setFSearch(e.target.value)}
              placeholder="Buscar por nome..."
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            />
          </div>
          <Select value={fMonth} onChange={setFMonth} placeholder="Todos os meses" options={monthNames.map((m, i) => ({ value: String(i + 1), label: m }))} />
          <Select value={fYear} onChange={setFYear} placeholder="Todos os anos" options={[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => ({ value: String(y), label: String(y) }))} />
          <Select value={fCategory} onChange={setFCategory} placeholder="Todas categorias" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          <Select value={fSource} onChange={setFSource} placeholder="Todas fontes" options={paymentSources.map((p) => ({ value: p.id, label: p.name }))} />
          <Select value={fType} onChange={setFType} placeholder="Todos tipos" options={[{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Receita' }]} />
        </div>
      </Card>

      {/* Bills table */}
      {filtered.length === 0 ? (
        <Card><EmptyState icon={<Receipt size={48} />} title="Nenhuma conta encontrada" description="Cadastre contas ou ajuste os filtros." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-medium">Descrição</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                  <th className="px-4 py-3 font-medium">Fonte</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                  <th className="px-4 py-3 font-medium">Vencimento</th>
                  <th className="px-4 py-3 font-medium">Ref.</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{b.description}{b.origin && <span className="block text-xs text-slate-400">{b.origin}</span>}</td>
                    <td className="px-4 py-3"><Badge color={b.type === 'expense' ? 'red' : 'green'}>{b.type === 'expense' ? 'Despesa' : 'Receita'}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{b.category?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{b.payment_source?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">R$ {formatBRL(Number(b.amount))}</td>
                    <td className="px-4 py-3 text-slate-600">{b.due_date ? formatDateBR(b.due_date) : '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{monthNames[b.month_ref - 1]}/{b.year_ref}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => togglePaid(b)} className="inline-flex items-center gap-1">
                        {b.status === 'paid' ? <Badge color="green"><CheckCircle size={12} className="mr-1" /> Paga</Badge> : <Badge color="amber"><Clock size={12} className="mr-1" /> Pendente</Badge>}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(b)}><Pencil size={14} /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(b)}><Trash2 size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Conta' : 'Nova Conta'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Descrição *" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Ex: Aluguel" required />
            <Select label="Tipo" value={form.type} onChange={(v) => setForm({ ...form, type: v as 'expense' | 'income' })} options={[{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Receita' }]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Categoria" value={form.category_id} onChange={(v) => setForm({ ...form, category_id: v, subcategory_id: '' })} options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="Sem categoria" />
            <Select label="Subcategoria" value={form.subcategory_id} onChange={(v) => setForm({ ...form, subcategory_id: v })} options={filteredSubs.map((s) => ({ value: s.id, label: s.name }))} placeholder="Sem subcategoria" disabled={!form.category_id} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Valor *" type="text" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="0,00" required />
            <Select label="Fonte Pagadora" value={form.payment_source_id} onChange={(v) => setForm({ ...form, payment_source_id: v })} options={paymentSources.map((p) => ({ value: p.id, label: p.name }))} placeholder="Sem fonte" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data de Vencimento" type="date" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
            <Input label="Data de Pagamento" type="date" value={form.payment_date} onChange={(v) => setForm({ ...form, payment_date: v })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Mês de Referência" value={form.month_ref} onChange={(v) => setForm({ ...form, month_ref: v })} options={monthNames.map((m, i) => ({ value: String(i + 1), label: m }))} />
            <Input label="Ano de Referência" type="number" value={form.year_ref} onChange={(v) => setForm({ ...form, year_ref: v })} />
          </div>
          <Input label="Origem (valor e origem da entrada)" value={form.origin} onChange={(v) => setForm({ ...form, origin: v })} placeholder="Ex: Pix, Dinheiro, Cartão" />
          <Input label="Observações" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Notas adicionais" />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
              <span className="text-sm text-slate-700">Conta recorrente</span>
            </label>
            <Select label="" value={form.status} onChange={(v) => setForm({ ...form, status: v as 'pending' | 'paid' })} options={[{ value: 'pending', label: 'Pendente' }, { value: 'paid', label: 'Paga' }]} />
          </div>

          {/* Replicate month */}
          <div className="bg-slate-50 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Replicar para o próximo mês</p>
              <p className="text-xs text-slate-400">Copia todas as contas do mês de referência para o mês seguinte</p>
            </div>
            <Button variant="secondary" size="sm" onClick={replicateMonth} disabled={replicating}>
              <Copy size={14} /> {replicating ? 'Replicando...' : 'Replicar'}
            </Button>
          </div>

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
