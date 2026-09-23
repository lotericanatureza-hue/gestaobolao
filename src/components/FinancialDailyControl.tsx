import { useEffect, useState, useCallback } from 'react';
import { CalendarCheck, Plus, Pencil, Trash2, DollarSign, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Modal, Spinner, EmptyState } from './ui';
import { formatBRL } from '../lib/format';
import type { FinDailyControl, Branch } from '../lib/types';

const emptyForm = {
  control_date: new Date().toISOString().split('T')[0],
  worked_amount: '',
  valor_003: '',
  safe_amount: '',
  notes: '',
};

export function FinancialDailyControl() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [records, setRecords] = useState<FinDailyControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinDailyControl | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fMonth, setFMonth] = useState('');

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
    const { data } = await supabase.from('fin_daily_control').select('*').eq('branch_id', selectedBranch).order('control_date', { ascending: false });
    setRecords((data ?? []) as FinDailyControl[]);
    setLoading(false);
  }, [selectedBranch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (r: FinDailyControl) => {
    setEditing(r);
    setForm({
      control_date: r.control_date,
      worked_amount: String(r.worked_amount),
      valor_003: String(r.valor_003 ?? 0),
      safe_amount: String(r.safe_amount),
      notes: r.notes ?? '',
    });
    setError(null);
    setModalOpen(true);
  };

  const save = async () => {
    const worked = parseFloat(form.worked_amount.replace(',', '.')) || 0;
    const valor003 = parseFloat(form.valor_003.replace(',', '.')) || 0;
    const safe = parseFloat(form.safe_amount.replace(',', '.')) || 0;
    const diff = worked + valor003 - safe;
    setSaving(true);
    setError(null);
    const payload = {
      branch_id: selectedBranch,
      control_date: form.control_date,
      worked_amount: worked,
      valor_003: valor003,
      safe_amount: safe,
      balance_difference: diff,
      notes: form.notes.trim() || null,
    };
    if (editing) {
      await supabase.from('fin_daily_control').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('fin_daily_control').insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    fetchData();
  };

  const remove = async (r: FinDailyControl) => {
    if (!confirm(`Excluir o registro de ${new Date(r.control_date).toLocaleDateString('pt-BR')}?`)) return;
    await supabase.from('fin_daily_control').delete().eq('id', r.id);
    fetchData();
  };

  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const filtered = records.filter((r) => {
    if (fMonth) {
      const d = new Date(r.control_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === fMonth;
    }
    return true;
  });

  const totalSafe = filtered.reduce((s, r) => s + Number(r.safe_amount), 0);
  const totalDiff = filtered.reduce((s, r) => s + Number(r.balance_difference), 0);
  const totalWorked = filtered.reduce((s, r) => s + Number(r.worked_amount), 0);
  const totalValor003 = filtered.reduce((s, r) => s + Number(r.valor_003 ?? 0), 0);

  const now = new Date();
  const monthOpts: { value: string; label: string }[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 1; y--) {
    for (let m = 11; m >= 0; m--) {
      monthOpts.push({ value: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${monthNames[m]} ${y}` });
    }
  }

  if (loading && !records.length) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Controle Diário"
        subtitle="Registro diário de trabalho, cofre e diferença de saldo"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Select value={selectedBranch} onChange={setSelectedBranch} options={branchOptions} placeholder="Selecionar filial" />
            )}
            <Select value={fMonth} onChange={setFMonth} options={monthOpts} placeholder="Todos os meses" />
            <Button onClick={openNew}><Plus size={18} /> Novo Registro</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><DollarSign size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Total Trabalhado</p>
          </div>
          <p className="text-2xl font-bold text-brand-950">R$ {formatBRL(totalWorked)}</p>
          <p className="text-sm text-slate-500 mt-1">{filtered.length} registros</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center"><DollarSign size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Total Valor 003</p>
          </div>
          <p className="text-2xl font-bold text-accent-600">R$ {formatBRL(totalValor003)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Wallet size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Total no Cofre</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">R$ {formatBRL(totalSafe)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${totalDiff >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              <CalendarCheck size={22} />
            </div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Diferença Total</p>
          </div>
          <p className={`text-2xl font-bold ${totalDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>R$ {formatBRL(totalDiff)}</p>
        </Card>
      </div>

      {filtered.length === 0 ? (
        <Card><EmptyState icon={<CalendarCheck size={48} />} title="Nenhum registro" description="Registre o controle diário da filial." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium text-right">Trabalhado no Dia</th>
                  <th className="px-4 py-3 font-medium text-right">Valor 003</th>
                  <th className="px-4 py-3 font-medium text-right">Cofre</th>
                  <th className="px-4 py-3 font-medium text-right">Diferença</th>
                  <th className="px-4 py-3 font-medium">Observações</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{new Date(r.control_date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-700">R$ {formatBRL(Number(r.worked_amount))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-accent-600">R$ {formatBRL(Number(r.valor_003 ?? 0))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">R$ {formatBRL(Number(r.safe_amount))}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${Number(r.balance_difference) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>R$ {formatBRL(Number(r.balance_difference))}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.notes ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil size={14} /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(r)}><Trash2 size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Registro' : 'Novo Registro Diário'}>
        <div className="space-y-4">
          <Input label="Data" type="date" value={form.control_date} onChange={(v) => setForm({ ...form, control_date: v })} required />
          <Input label="Trabalhado no Dia (R$)" type="text" value={form.worked_amount} onChange={(v) => setForm({ ...form, worked_amount: v })} placeholder="0,00" />
          <Input label="Valor 003" type="text" value={form.valor_003} onChange={(v) => setForm({ ...form, valor_003: v })} placeholder="0,00" />
          <Input label="Valor no Cofre" type="text" value={form.safe_amount} onChange={(v) => setForm({ ...form, safe_amount: v })} placeholder="0,00" />
          <div className="bg-slate-50 rounded-lg p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">Diferença de Saldo (automático)</span>
            <span className={`text-lg font-bold ${((parseFloat(form.worked_amount.replace(',', '.')) || 0) + (parseFloat(form.valor_003.replace(',', '.')) || 0)) - (parseFloat(form.safe_amount.replace(',', '.')) || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              R$ {formatBRL(((parseFloat(form.worked_amount.replace(',', '.')) || 0) + (parseFloat(form.valor_003.replace(',', '.')) || 0)) - (parseFloat(form.safe_amount.replace(',', '.')) || 0))}
            </span>
          </div>
          <Input label="Observações" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Notas adicionais" />
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
