import { Fragment, useEffect, useState, useCallback } from 'react';
import { CalendarCheck, Plus, Pencil, Trash2, DollarSign, Wallet, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, MoneyInput, Select, Modal, Spinner, EmptyState } from './ui';
import { formatBRL, formatDateBR, parseBRL, maskBRL } from '../lib/format';
import type { FinDailyControl, DailyWithdrawal, Branch } from '../lib/types';

const emptyForm = {
  control_date: new Date().toISOString().split('T')[0],
  worked_amount: '',
  valor_003: '',
  safe_amount: '',
  current_safe_amount: '',
  notes: '',
};

const weekdaysShort = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function getWeekendSaturday(dateStr: string): string | null {
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [y, m, d] = datePart.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  if (dow === 6) return datePart;
  if (dow === 0) return formatYmd(new Date(y, m - 1, d - 1));
  if (dow === 1) return formatYmd(new Date(y, m - 1, d - 2));
  return null;
}

function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface PeriodGroup {
  key: string;
  records: FinDailyControl[];
  label: string;
}

function groupByPeriod(records: FinDailyControl[]): PeriodGroup[] {
  const map = new Map<string, FinDailyControl[]>();
  for (const r of records) {
    const sat = getWeekendSaturday(r.control_date);
    const key = sat ?? r.control_date;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries()).map(([key, recs]) => {
    const sorted = [...recs].sort((a, b) => a.control_date.localeCompare(b.control_date));
    let label: string;
    if (sorted.length === 1) {
      label = formatDateBR(sorted[0].control_date, { weekday: 'short' });
    } else {
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const [fy, fm, fd] = first.control_date.split('-');
      const [ly, lm, ld] = last.control_date.split('-');
      const firstDate = new Date(Number(fy), Number(fm) - 1, Number(fd));
      const lastDate = new Date(Number(ly), Number(lm) - 1, Number(ld));
      const firstWd = weekdaysShort[firstDate.getDay()];
      const lastWd = weekdaysShort[lastDate.getDay()];
      label = fm === lm
        ? `${fd}-${ld} ${firstWd}-${lastWd}`
        : `${fd}/${fm}-${ld}/${lm} ${firstWd}-${lastWd}`;
    }
    return { key, records: sorted, label };
  }).sort((a, b) => b.key.localeCompare(a.key));
}

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
  const [withdrawals, setWithdrawals] = useState<DailyWithdrawal[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fMonth, setFMonth] = useState('');
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

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
    setWithdrawals([]);
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
      current_safe_amount: String(r.current_safe_amount ?? 0),
      notes: r.notes ?? '',
    });
    setWithdrawals(r.withdrawals ?? []);
    setError(null);
    setModalOpen(true);
  };

  const addWithdrawal = () => setWithdrawals([...withdrawals, { id: crypto.randomUUID(), description: '', amount: 0 }]);
  const updateWithdrawal = (id: string, field: 'description' | 'amount', value: string) => {
    setWithdrawals(withdrawals.map((w) => w.id === id ? { ...w, [field]: field === 'amount' ? parseBRL(value) : value } : w));
  };
  const removeWithdrawal = (id: string) => setWithdrawals(withdrawals.filter((w) => w.id !== id));
  const totalWithdrawals = withdrawals.reduce((s, w) => s + Number(w.amount), 0);

  const save = async () => {
    const worked = parseBRL(form.worked_amount);
    const valor003 = totalWithdrawals;
    const safe = parseBRL(form.safe_amount);
    const currentSafe = parseBRL(form.current_safe_amount);
    const diff = currentSafe - safe;
    setSaving(true);
    setError(null);
    const payload = {
      branch_id: selectedBranch,
      control_date: form.control_date,
      worked_amount: worked,
      valor_003: valor003,
      valor_043: 0,
      safe_amount: safe,
      current_safe_amount: currentSafe,
      balance_difference: diff,
      withdrawals: withdrawals as unknown as Record<string, unknown>[],
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
    if (!confirm(`Excluir o registro de ${formatDateBR(r.control_date)}?`)) return;
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

  const groups = groupByPeriod(filtered);
  const totalSafe = filtered.reduce((s, r) => s + Number(r.safe_amount), 0);
  const totalCurrentSafe = filtered.reduce((s, r) => s + Number(r.current_safe_amount ?? 0), 0);
  const totalSaldoGeral = filtered.reduce((s, r) => s + (Number(r.current_safe_amount ?? 0) - Number(r.safe_amount)), 0);
  const totalWorked = filtered.reduce((s, r) => s + Number(r.worked_amount), 0);
  const totalValor003 = filtered.reduce((s, r) => s + (r.withdrawals?.reduce((ws, w) => ws + Number(w.amount), 0) ?? Number(r.valor_003 ?? 0)), 0);

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
        subtitle="Registro diário de trabalho, carro forte e cofre"
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

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-6">
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
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Total Retiradas</p>
          </div>
          <p className="text-2xl font-bold text-accent-600">R$ {formatBRL(totalValor003)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Wallet size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Total Carro Forte</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">R$ {formatBRL(totalSafe)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Wallet size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Valor atual no Cofre</p>
          </div>
          <p className="text-2xl font-bold text-amber-600">R$ {formatBRL(totalCurrentSafe)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${totalSaldoGeral >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
              <CalendarCheck size={22} />
            </div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Saldo Geral</p>
          </div>
          <p className={`text-2xl font-bold ${totalSaldoGeral >= 0 ? 'text-blue-600' : 'text-red-600'}`}>R$ {formatBRL(totalSaldoGeral)}</p>
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
                  <th className="px-4 py-3 font-medium">Período</th>
                  <th className="px-4 py-3 font-medium text-right">Trabalhado no Dia</th>
                  <th className="px-4 py-3 font-medium text-right">Retiradas</th>
                  <th className="px-4 py-3 font-medium text-right">Carro Forte</th>
                  <th className="px-4 py-3 font-medium text-right">Valor atual no Cofre</th>
                  <th className="px-4 py-3 font-medium text-right">Saldo Geral</th>
                  <th className="px-4 py-3 font-medium">Observações</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const sumWorked = g.records.reduce((s, r) => s + Number(r.worked_amount), 0);
                  const sumValor003 = g.records.reduce((s, r) => s + (r.withdrawals?.reduce((ws, w) => ws + Number(w.amount), 0) ?? Number(r.valor_003 ?? 0)), 0);
                  const sumSafe = g.records.reduce((s, r) => s + Number(r.safe_amount), 0);
                  const sumCurrentSafe = g.records.reduce((s, r) => s + Number(r.current_safe_amount ?? 0), 0);
                  const sumSaldoGeral = g.records.reduce((s, r) => s + (Number(r.current_safe_amount ?? 0) - Number(r.safe_amount)), 0);
                  const notes = g.records.map((r) => r.notes).filter(Boolean).join('; ') || '—';
                  const expanded = expandedPeriod === g.key;
                  return (
                    <Fragment key={g.key}>
                      <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {g.records.length > 1 ? (
                            <button onClick={() => setExpandedPeriod(expanded ? null : g.key)} className="flex items-center gap-1 hover:text-brand-600 transition-colors">
                              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              {g.label}
                            </button>
                          ) : (
                            g.label
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-brand-700">R$ {formatBRL(sumWorked)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-accent-600">R$ {formatBRL(sumValor003)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">R$ {formatBRL(sumSafe)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-amber-600">R$ {formatBRL(sumCurrentSafe)}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${sumSaldoGeral >= 0 ? 'text-blue-600' : 'text-red-600'}`}>R$ {formatBRL(sumSaldoGeral)}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{notes}</td>
                        <td className="px-4 py-3 text-right">
                          {g.records.length === 1 && (
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(g.records[0])}><Pencil size={14} /></Button>
                              <Button size="sm" variant="ghost" onClick={() => remove(g.records[0])}><Trash2 size={14} /></Button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {expanded && g.records.map((r) => (
                        <tr key={r.id} className="border-b border-slate-50 bg-slate-50/50">
                          <td className="px-4 py-2 pl-8 text-sm text-slate-600">{formatDateBR(r.control_date, { weekday: 'short' })}</td>
                          <td className="px-4 py-2 text-right text-slate-600">R$ {formatBRL(Number(r.worked_amount))}</td>
                          <td className="px-4 py-2 text-right text-slate-600">R$ {formatBRL(r.withdrawals?.reduce((ws, w) => ws + Number(w.amount), 0) ?? Number(r.valor_003 ?? 0))}</td>
                          <td className="px-4 py-2 text-right text-slate-600">R$ {formatBRL(Number(r.safe_amount))}</td>
                          <td className="px-4 py-2 text-right text-slate-600">R$ {formatBRL(Number(r.current_safe_amount ?? 0))}</td>
                          <td className={`px-4 py-2 text-right ${(Number(r.current_safe_amount ?? 0) - Number(r.safe_amount)) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>R$ {formatBRL(Number(r.current_safe_amount ?? 0) - Number(r.safe_amount))}</td>
                          <td className="px-4 py-2 text-slate-400 text-xs">{r.notes ?? '—'}</td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil size={14} /></Button>
                              <Button size="sm" variant="ghost" onClick={() => remove(r)}><Trash2 size={14} /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Registro' : 'Novo Registro Diário'}>
        <div className="space-y-4">
          <Input label="Data" type="date" value={form.control_date} onChange={(v) => setForm({ ...form, control_date: v })} required />
          <MoneyInput label="Trabalhado no Dia (R$)" value={form.worked_amount} onChange={(v) => setForm({ ...form, worked_amount: v })} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Retiradas</label>
              <Button size="sm" variant="secondary" onClick={addWithdrawal}><Plus size={14} /> Adicionar</Button>
            </div>
            {withdrawals.length === 0 && (
              <p className="text-sm text-slate-400">Nenhuma retirada adicionada.</p>
            )}
            {withdrawals.map((w) => (
              <div key={w.id} className="flex items-start gap-2">
                <div className="flex-1">
                  <MoneyInput value={maskBRL(String(Math.round(w.amount * 100)))} onChange={(v) => updateWithdrawal(w.id, 'amount', v)} placeholder="Valor" />
                </div>
                <div className="flex-1">
                  <Input type="text" value={w.description} onChange={(v) => updateWithdrawal(w.id, 'description', v)} placeholder="Observação" />
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeWithdrawal(w.id)}><Trash2 size={14} /></Button>
              </div>
            ))}
            {withdrawals.length > 0 && (
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-sm font-medium text-slate-600">Total Retiradas</span>
                <span className="text-sm font-bold text-accent-600">R$ {formatBRL(totalWithdrawals)}</span>
              </div>
            )}
          </div>
          <MoneyInput label="Carro Forte" value={form.safe_amount} onChange={(v) => setForm({ ...form, safe_amount: v })} />
          <MoneyInput label="Valor atual no Cofre" value={form.current_safe_amount} onChange={(v) => setForm({ ...form, current_safe_amount: v })} />
          <div className="bg-slate-50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Saldo (Carro Forte - Trabalhado)</span>
              <span className="text-lg font-bold text-slate-700">
                R$ {formatBRL(parseBRL(form.safe_amount) - parseBRL(form.worked_amount))}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Saldo Geral</span>
              <span className={`text-lg font-bold ${(parseBRL(form.current_safe_amount) - parseBRL(form.safe_amount)) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                R$ {formatBRL(parseBRL(form.current_safe_amount) - parseBRL(form.safe_amount))}
              </span>
            </div>
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
