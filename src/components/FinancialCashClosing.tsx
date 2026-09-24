import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Upload, FileText, Download, PlusCircle, Trash, Lock, Unlock, Loader2, CheckCircle, AlertCircle, User, ChevronDown, ChevronRight, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, MoneyInput, Select, Modal, Badge, Spinner, EmptyState } from './ui';
import { formatBRL, formatDateBR, parseBRL, maskBRL } from '../lib/format';
import type { FinCashClosing, FinEmployee, PixExternal, DailyWithdrawal, Branch } from '../lib/types';

interface ExtractedData {
  closing_date: string;
  total_sales: number;
  total_income: number;
  total_credits: number;
  total_debits: number;
  safe_amount: number;
  cash_drawer: number;
  saldo_final: number;
  total_em_caixa: number;
}

function parseBRLValue(text: string, patterns: string[]): number {
  for (const pattern of patterns) {
    const regex = new RegExp(pattern, 'i');
    const match = text.match(regex);
    if (match && match[1]) {
      const cleaned = match[1].replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
      const val = parseFloat(cleaned);
      if (!isNaN(val)) return val;
    }
  }
  return 0;
}

function extractDate(text: string): string {
  const dateMatch = text.match(/(\d{2})[\/](\d{2})[\/](\d{4})/);
  if (dateMatch) return `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  return new Date().toISOString().split('T')[0];
}

async function extractPdfData(file: File): Promise<ExtractedData> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: unknown) => {
      const obj = item as { str?: string };
      return obj.str ?? '';
    }).join(' ');
    fullText += pageText + '\n';
  }

  return {
    closing_date: extractDate(fullText),
    total_sales: parseBRLValue(fullText, [
      'total\\s*(?:de\\s*)?vendas?[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'vendas?[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'total\\s*vendido[:\\s]*R?\\$?\\s*([\\d.,]+)',
    ]),
    total_income: parseBRLValue(fullText, [
      'total\\s*(?:de\\s*)?entrada[s]?[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'entrada[s]?[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'total\\s*(?:de\\s*)?receita[s]?[:\\s]*R?\\$?\\s*([\\d.,]+)',
    ]),
    total_credits: parseBRLValue(fullText, [
      'total\\s*(?:de\\s*)?cr[eé]ditos?[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'cr[eé]ditos?[:\\s]*R?\\$?\\s*([\\d.,]+)',
    ]),
    total_debits: parseBRLValue(fullText, [
      'total\\s*(?:de\\s*)?d[eé]bitos?[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'd[eé]bitos?[:\\s]*R?\\$?\\s*([\\d.,]+)',
    ]),
    safe_amount: parseBRLValue(fullText, [
      'cofre[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'valor\\s*(?:do\\s*)?cofre[:\\s]*R?\\$?\\s*([\\d.,]+)',
    ]),
    cash_drawer: parseBRLValue(fullText, [
      'caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'valor\\s*(?:em\\s*)?caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'fundo\\s*(?:de\\s*)?caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
    ]),
    saldo_final: parseBRLValue(fullText, [
      'saldo\\s*final[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'saldo[:\\s]*R?\\$?\\s*([\\d.,]+)',
    ]),
    total_em_caixa: parseBRLValue(fullText, [
      'total\\s*(?:em\\s*)?caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'em\\s*caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
    ]),
  };
}

const todayStr = () => new Date().toISOString().split('T')[0];

const emptyForm = {
  closing_date: todayStr(),
  total_sales: 0,
  total_income: 0,
  total_credits: 0,
  total_debits: 0,
  safe_amount: 0,
  cash_drawer: 0,
  saldo_final: 0,
  total_em_caixa: 0,
  deposit_amount: '',
  surplus: '',
  shortage: '',
  notes: '',
  status: 'open' as 'open' | 'closed',
};

export function FinancialCashClosing() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [employees, setEmployees] = useState<FinEmployee[]>([]);
  const [closings, setClosings] = useState<FinCashClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinCashClosing | null>(null);
  const [modalEmployee, setModalEmployee] = useState<FinEmployee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pixExternals, setPixExternals] = useState<PixExternal[]>([]);
  const [withdrawals, setWithdrawals] = useState<DailyWithdrawal[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [existingPdf, setExistingPdf] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [fDate, setFDate] = useState(todayStr());

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
    const [ccRes, empRes] = await Promise.all([
      supabase.from('fin_cash_closing').select('*, branch:branches(*), employee:fin_employees(*)').eq('branch_id', selectedBranch).order('closing_date', { ascending: false }),
      supabase.from('fin_employees').select('*').eq('branch_id', selectedBranch).eq('active', true).order('name'),
    ]);
    setClosings((ccRes.data ?? []) as FinCashClosing[]);
    setEmployees((empRes.data ?? []) as FinEmployee[]);
    setLoading(false);
  }, [selectedBranch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  const openRetroactive = (employee: FinEmployee) => {
    setEditing(null);
    setModalEmployee(employee);
    setForm({ ...emptyForm, closing_date: fDate });
    setPixExternals([]);
    setWithdrawals([]);
    setPdfFile(null);
    setExistingPdf(null);
    setExtracted(false);
    setManualMode(true);
    setError(null);
    setModalOpen(true);
  };

  const openNew = (employee: FinEmployee) => {
    setEditing(null);
    setModalEmployee(employee);
    setForm({ ...emptyForm, closing_date: fDate });
    setPixExternals([]);
    setWithdrawals([]);
    setPdfFile(null);
    setExistingPdf(null);
    setExtracted(false);
    setManualMode(false);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: FinCashClosing) => {
    const emp = employees.find((e) => e.id === c.employee_id) ?? null;
    setEditing(c);
    setModalEmployee(emp);
    setForm({
      closing_date: c.closing_date,
      total_sales: Number(c.total_sales),
      total_income: Number(c.total_income),
      total_credits: 0,
      total_debits: 0,
      safe_amount: Number(c.safe_amount),
      cash_drawer: Number(c.cash_drawer),
      saldo_final: 0,
      total_em_caixa: 0,
      deposit_amount: String(c.deposit_amount ?? 0),
      surplus: String(c.surplus),
      shortage: String(c.shortage),
      notes: c.notes ?? '',
      status: c.status,
    });
    setPixExternals(c.pix_externals ?? []);
    setWithdrawals(c.withdrawals ?? []);
    setPdfFile(null);
    setExistingPdf(c.pdf_path);
    setExtracted(true);
    setManualMode(false);
    setError(null);
    setModalOpen(true);
  };

  const handlePdfSelect = async (file: File) => {
    setPdfFile(file);
    setExtracting(true);
    setExtracted(false);
    setError(null);
    try {
      const data = await extractPdfData(file);
      setForm((prev) => ({
        ...prev,
        closing_date: data.closing_date,
        total_sales: data.total_sales,
        total_income: data.total_income,
        total_credits: data.total_credits,
        total_debits: data.total_debits,
        safe_amount: data.safe_amount,
        cash_drawer: data.cash_drawer,
        saldo_final: data.saldo_final,
        total_em_caixa: data.total_em_caixa,
      }));
      setExtracted(true);
    } catch (err) {
      setError('Não foi possível extrair dados do PDF. Verifique se o arquivo é válido.');
      console.error(err);
    }
    setExtracting(false);
  };

  const addPix = () => setPixExternals([...pixExternals, { id: crypto.randomUUID(), description: '', amount: 0 }]);
  const updatePix = (id: string, field: 'description' | 'amount' | 'checked', value: string | boolean) => {
    setPixExternals(pixExternals.map((p) => p.id === id ? {
      ...p,
      [field]: field === 'amount' ? parseBRL(value as string) : field === 'checked' ? value : value,
    } : p));
  };
  const removePix = (id: string) => setPixExternals(pixExternals.filter((p) => p.id !== id));
  const totalPix = pixExternals.reduce((s, p) => s + Number(p.amount), 0);

  const addWithdrawal = () => setWithdrawals([...withdrawals, { id: crypto.randomUUID(), description: '', amount: 0 }]);
  const updateWithdrawal = (id: string, field: 'description' | 'amount', value: string) => {
    setWithdrawals(withdrawals.map((w) => w.id === id ? { ...w, [field]: field === 'amount' ? parseBRL(value) : value } : w));
  };
  const removeWithdrawal = (id: string) => setWithdrawals(withdrawals.filter((w) => w.id !== id));
  const totalWithdrawals = withdrawals.reduce((s, w) => s + Number(w.amount), 0);

  const uploadPdf = async (): Promise<string | null> => {
    if (!pdfFile || !selectedBranch) return existingPdf;
    const fileExt = pdfFile.name.split('.').pop();
    const fileName = `${selectedBranch}/${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('financial-pdfs').upload(fileName, pdfFile);
    if (uploadError) { setError('Erro ao enviar PDF: ' + uploadError.message); return null; }
    return fileName;
  };

  const save = async () => {
    if (!modalEmployee) { setError('Funcionário não selecionado.'); return; }
    setSaving(true);
    setError(null);
    const pdfPath = await uploadPdf();
    if (pdfFile && !pdfPath) { setSaving(false); return; }

    const manualSaldoFinal = form.total_sales - form.total_income;
    const manualSaldoGeral =
      form.safe_amount + form.cash_drawer + totalPix + totalWithdrawals - parseBRL(form.deposit_amount);
    const manualDiff = manualSaldoGeral - manualSaldoFinal;
    const manualSurplus  = manualMode && manualDiff > 0 ?  manualDiff : parseBRL(form.surplus);
    const manualShortage = manualMode && manualDiff < 0 ? Math.abs(manualDiff) : parseBRL(form.shortage);

    const payload = {
      branch_id: selectedBranch,
      employee_id: modalEmployee.id,
      closing_date: form.closing_date,
      total_sales: form.total_sales,
      total_income: form.total_income,
      pix_externals: pixExternals as unknown as Record<string, unknown>[],
      total_pix_externals: totalPix,
      withdrawals: withdrawals as unknown as Record<string, unknown>[],
      total_withdrawals: totalWithdrawals,
      surplus: manualSurplus,
      shortage: manualShortage,
      safe_amount: form.safe_amount,
      cash_drawer: form.cash_drawer,
      deposit_amount: parseBRL(form.deposit_amount),
      pdf_path: pdfPath,
      notes: form.notes.trim() || null,
      status: form.status,
    };
    if (editing) {
      await supabase.from('fin_cash_closing').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('fin_cash_closing').insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    fetchData();
  };

  const removeClosing = async (c: FinCashClosing) => {
    if (!confirm(`Excluir o fechamento de ${formatDateBR(c.closing_date)}?`)) return;
    if (c.pdf_path) await supabase.storage.from('financial-pdfs').remove([c.pdf_path]);
    await supabase.from('fin_cash_closing').delete().eq('id', c.id);
    fetchData();
  };

  const toggleStatus = async (c: FinCashClosing) => {
    const newStatus = c.status === 'open' ? 'closed' : 'open';
    await supabase.from('fin_cash_closing').update({ status: newStatus }).eq('id', c.id);
    fetchData();
  };

  const downloadPdf = async (path: string) => {
    const { data } = await supabase.storage.from('financial-pdfs').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  // Filter closings by selected date
  const dateClosings = closings.filter((c) => c.closing_date === fDate);

  // Per-employee data
  const employeeData = employees.map((emp) => {
    const empClosings = closings.filter((c) => c.employee_id === emp.id);
    return { employee: emp, allClosings: [...empClosings].sort((a, b) => b.closing_date.localeCompare(a.closing_date)) };
  });

  // Totals for the day
  const dayTotalSales = dateClosings.reduce((s, c) => s + Number(c.total_sales), 0);
  const dayTotalPix = dateClosings.reduce((s, c) => s + Number(c.total_pix_externals), 0);
  const dayTotalSurplus = dateClosings.reduce((s, c) => s + Number(c.surplus), 0);
  const dayTotalShortage = dateClosings.reduce((s, c) => s + Number(c.shortage), 0);

  if (loading && !closings.length) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Fechamento de Caixa"
        subtitle="Cada funcionário tem seu próprio fechamento — extração automática do PDF"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Select value={selectedBranch} onChange={setSelectedBranch} options={branchOptions} placeholder="Selecionar filial" />
            )}
            <Input type="date" value={fDate} onChange={setFDate} />
          </div>
        }
      />

      {/* Day summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Vendas do Dia</p>
          <p className="text-xl font-bold text-brand-950">R$ {formatBRL(dayTotalSales)}</p>
          <p className="text-xs text-slate-400 mt-1">{dateClosings.length} fechamento(s)</p>
        </Card>
        <Card className="p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Pix Externos</p>
          <p className="text-xl font-bold text-brand-600">R$ {formatBRL(dayTotalPix)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Sobras</p>
          <p className="text-xl font-bold text-emerald-600">R$ {formatBRL(dayTotalSurplus)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Faltas</p>
          <p className="text-xl font-bold text-red-600">R$ {formatBRL(dayTotalShortage)}</p>
        </Card>
      </div>

      {/* Employee cards */}
      {employees.length === 0 ? (
        <Card><EmptyState icon={<User size={48} />} title="Nenhum funcionário cadastrado" description="Cadastre funcionários na aba Funcionários para que cada um tenha seu próprio fechamento de caixa." /></Card>
      ) : (
        <div className="space-y-4">
          {employeeData.map(({ employee, allClosings }) => {
            const isExpanded = expandedEmp === employee.id;
            const todayClosing = allClosings.find((c) => c.closing_date === fDate);
            return (
              <Card key={employee.id} className="overflow-hidden">
                {/* Employee header */}
                <div
                  className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedEmp(isExpanded ? null : employee.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                      <User size={22} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{employee.name}</h3>
                      <p className="text-xs text-slate-400">TFL: {employee.tfl}{employee.position ? ` • ${employee.position}` : ''}</p>
                      {(() => {
                        const totalSurplus = allClosings.reduce((s, c) => s + Number(c.surplus), 0);
                        const totalShortage = allClosings.reduce((s, c) => s + Number(c.shortage), 0);
                        const result = totalSurplus - totalShortage;
                        return (
                          <p className="text-xs mt-1 flex items-center gap-3">
                            <span className="text-emerald-600">Sobras: R$ {formatBRL(totalSurplus)}</span>
                            <span className="text-red-600">Faltas: R$ {formatBRL(totalShortage)}</span>
                            <span className={result >= 0 ? 'text-slate-700 font-semibold' : 'text-red-700 font-semibold'}>Resultado: R$ {formatBRL(result)}</span>
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {todayClosing ? (
                      todayClosing.status === 'closed' ? (
                        <Badge color="blue"><Lock size={12} className="mr-1" /> Caixa fechado</Badge>
                      ) : (
                        <Badge color="amber"><Unlock size={12} className="mr-1" /> Pendente</Badge>
                      )
                    ) : (
                      <Badge color="slate">Sem caixa hoje</Badge>
                    )}
                    {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-slate-100 p-5 space-y-4">
                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" onClick={() => openNew(employee)}>
                        <Plus size={14} /> Fechar Caixa
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openRetroactive(employee)}>
                        <Calendar size={14} /> Fechar Retroativo
                      </Button>
                    </div>

                    {/* All closings as collapsible list */}
                    {allClosings.length > 0 ? (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-slate-600 flex items-center gap-2">
                          <FileText size={16} /> Histórico de Fechamentos ({allClosings.length})
                        </h4>
                        {allClosings.map((c) => (
                          <details key={c.id} className={`rounded-lg border transition-colors ${c.status === 'closed' ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
                            <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-100 transition-colors rounded-lg">
                              <div className="flex items-center gap-3">
                                {c.status === 'closed' ? (
                                  <Badge color="blue"><Lock size={12} className="mr-1" /> Fechado</Badge>
                                ) : (
                                  <Badge color="amber"><Unlock size={12} className="mr-1" /> Pendente</Badge>
                                )}
                                <span className="text-sm font-medium text-slate-700">{formatDateBR(c.closing_date)}</span>
                                <span className="text-sm text-slate-500">Vendas: R$ {formatBRL(Number(c.total_sales))}</span>
                                {Number(c.surplus) > 0 && <span className="text-sm font-medium text-emerald-600">Sobra: R$ {formatBRL(Number(c.surplus))}</span>}
                                {Number(c.shortage) > 0 && <span className="text-sm font-medium text-red-600">Falta: R$ {formatBRL(Number(c.shortage))}</span>}
                              </div>
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                {c.pdf_path && <button onClick={() => downloadPdf(c.pdf_path!)} className="text-brand-600 text-sm flex items-center gap-1"><FileText size={14} /> PDF</button>}
                                <button onClick={() => toggleStatus(c)} className="text-slate-500 text-sm" title={c.status === 'closed' ? 'Reabrir' : 'Fechar'}>
                                  {c.status === 'closed' ? <Unlock size={14} /> : <Lock size={14} />}
                                </button>
                                <button onClick={() => openEdit(c)} className="text-brand-600 text-sm"><Pencil size={14} /></button>
                                <button onClick={() => removeClosing(c)} className="text-red-500 text-sm"><Trash2 size={14} /></button>
                              </div>
                            </summary>
                            <div className="px-3 pb-3 pt-1 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                              <div><span className="text-slate-500">Créditos:</span> <span className="font-medium text-emerald-700">R$ {formatBRL(Number(c.total_sales))}</span></div>
                              <div><span className="text-slate-500">Débitos:</span> <span className="font-medium text-red-700">R$ {formatBRL(Number(c.total_income))}</span></div>
                              <div><span className="text-slate-500">Saldo Final:</span> <span className="font-medium">R$ {formatBRL(Number(c.total_sales) - Number(c.total_income))}</span></div>
                              <div><span className="text-slate-500">Pix Ext.:</span> <span className="font-medium text-brand-600">R$ {formatBRL(Number(c.total_pix_externals))}</span></div>
                              <div><span className="text-slate-500">Cofre:</span> <span className="font-medium">R$ {formatBRL(Number(c.safe_amount))}</span></div>
                              <div><span className="text-slate-500">Caixa:</span> <span className="font-medium">R$ {formatBRL(Number(c.cash_drawer))}</span></div>
                              <div><span className="text-slate-500">Retiradas:</span> <span className="font-medium">R$ {formatBRL(Number(c.total_withdrawals ?? 0))}</span></div>
                              <div><span className="text-slate-500">Depósitos:</span> <span className="font-medium">R$ {formatBRL(Number(c.deposit_amount ?? 0))}</span></div>
                              <div><span className="text-slate-500">Saldo Geral:</span> <span className="font-medium">R$ {formatBRL(Number(c.safe_amount) + Number(c.cash_drawer) + Number(c.total_pix_externals) + Number(c.total_withdrawals ?? 0) - Number(c.deposit_amount ?? 0))}</span></div>
                              <div><span className="text-slate-500">Sobra:</span> <span className="font-medium text-emerald-600">R$ {formatBRL(Number(c.surplus))}</span></div>
                              <div><span className="text-slate-500">Falta:</span> <span className="font-medium text-red-600">R$ {formatBRL(Number(c.shortage))}</span></div>
                              <div><span className="text-slate-500">Status:</span> <span className="font-medium">{c.status === 'closed' ? 'Fechado' : 'Pendente'}</span></div>
                              {c.notes && <div className="col-span-2 sm:col-span-4"><span className="text-slate-500">Justificativa:</span> <span className="text-slate-600">{c.notes}</span></div>}
                            </div>
                          </details>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 text-center py-4">Nenhum fechamento registrado para este funcionário.</p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Fechamento' : 'Novo Fechamento de Caixa'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          {modalEmployee && (
            <div className="flex items-center gap-3 bg-brand-50 rounded-lg p-3">
              <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center"><User size={18} /></div>
              <div>
                <p className="font-semibold text-brand-900">{modalEmployee.name}</p>
                <p className="text-xs text-brand-600">TFL: {modalEmployee.tfl}</p>
              </div>
            </div>
          )}

          <Input label="Data do Fechamento" type="date" value={form.closing_date} onChange={(v) => setForm({ ...form, closing_date: v })} required />

          {manualMode ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <span className="text-sm text-amber-700">Modo retroativo: insira manualmente os valores que viriam do PDF.</span>
            </div>
          ) : (
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">PDF do Fechamento (extração automática)</span>
              {existingPdf && !pdfFile && (
                <div className="flex items-center gap-2 mb-2 text-sm text-brand-600 bg-brand-50 rounded-lg p-3">
                  <FileText size={16} /> PDF já enviado
                  <button onClick={() => downloadPdf(existingPdf)} className="ml-auto text-brand-700 hover:underline flex items-center gap-1"><Download size={14} /> Ver</button>
                </div>
              )}
              <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 cursor-pointer transition-colors ${extracting ? 'border-brand-400 bg-brand-50' : 'border-slate-300 hover:border-brand-400'}`}>
                {extracting ? (
                  <><Loader2 size={20} className="text-brand-500 animate-spin" /><span className="text-sm text-brand-600">Extraindo dados do PDF...</span></>
                ) : extracted ? (
                  <><CheckCircle size={20} className="text-emerald-500" /><span className="text-sm text-emerald-600">{pdfFile ? pdfFile.name : 'PDF carregado e dados extraídos'}</span></>
                ) : (
                  <><Upload size={20} className="text-slate-400" /><span className="text-sm text-slate-500">{pdfFile ? pdfFile.name : 'Clique para enviar um PDF'}</span></>
                )}
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePdfSelect(e.target.files[0]); }} />
              </label>
            </div>
          )}

          {/* Data fields — editable in manual mode, read-only display when extracted from PDF */}
          {(extracted || manualMode) ? (
            <div className="space-y-3">
              {manualMode && (
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Preencha os valores manualmente</p>
              )}

              {/* KPI cards */}
              <div className="grid grid-cols-3 gap-3">
                {manualMode ? (
                  <div className="p-4 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Créditos</span>
                    <input type="text" inputMode="numeric" value={form.total_sales ? maskBRL(String(Math.round(form.total_sales * 100))) : ''} onChange={(e) => setForm({ ...form, total_sales: parseBRL(e.target.value) })} placeholder="R$ 0,00" className="w-full mt-1 text-lg font-bold tabular-nums text-emerald-700 bg-transparent border-b border-slate-200 focus:border-emerald-500 focus:outline-none" />
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                    <div className="flex items-center gap-1.5 mb-1 text-emerald-700">
                      <TrendingUp size={14} />
                      <span className="text-[10px] font-bold uppercase">Total Vendas</span>
                    </div>
                    <p className="text-lg font-black tabular-nums text-emerald-700">R$ {formatBRL(form.total_sales)}</p>
                  </div>
                )}
                {manualMode ? (
                  <div className="p-4 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Débitos</span>
                    <input type="text" inputMode="numeric" value={form.total_income ? maskBRL(String(Math.round(form.total_income * 100))) : ''} onChange={(e) => setForm({ ...form, total_income: parseBRL(e.target.value) })} placeholder="R$ 0,00" className="w-full mt-1 text-lg font-bold tabular-nums text-red-700 bg-transparent border-b border-slate-200 focus:border-red-500 focus:outline-none" />
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-red-200 bg-red-50">
                    <div className="flex items-center gap-1.5 mb-1 text-red-700">
                      <TrendingDown size={14} />
                      <span className="text-[10px] font-bold uppercase">Total Entradas</span>
                    </div>
                    <p className="text-lg font-black tabular-nums text-red-700">R$ {formatBRL(form.total_income)}</p>
                  </div>
                )}
                <div className={`p-4 rounded-xl ${manualMode ? 'border border-slate-200' : 'border border-brand-200 bg-brand-50'}`}>
                  <span className="text-[10px] font-bold uppercase text-brand-600">Saldo Final</span>
                  {manualMode ? (
                    <p className="text-lg font-black tabular-nums text-brand-700 mt-1">R$ {formatBRL(form.total_sales - form.total_income)}</p>
                  ) : (
                    <p className="text-lg font-black tabular-nums text-brand-700">R$ {formatBRL(form.saldo_final || (form.total_sales - form.total_income))}</p>
                  )}
                </div>
              </div>

              {manualMode && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Cofre</span>
                    <input type="text" inputMode="numeric" value={form.safe_amount ? maskBRL(String(Math.round(form.safe_amount * 100))) : ''} onChange={(e) => setForm({ ...form, safe_amount: parseBRL(e.target.value) })} placeholder="R$ 0,00" className="w-full mt-1 text-base font-bold tabular-nums text-slate-900 bg-transparent border-b border-slate-200 focus:border-slate-500 focus:outline-none" />
                  </div>
                  <div className="p-3 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Caixa (Gaveta)</span>
                    <input type="text" inputMode="numeric" value={form.cash_drawer ? maskBRL(String(Math.round(form.cash_drawer * 100))) : ''} onChange={(e) => setForm({ ...form, cash_drawer: parseBRL(e.target.value) })} placeholder="R$ 0,00" className="w-full mt-1 text-base font-bold tabular-nums text-slate-900 bg-transparent border-b border-slate-200 focus:border-slate-500 focus:outline-none" />
                  </div>
                </div>
              )}

              {/* Credit/Debit summary — only show in PDF mode */}
              {!manualMode && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
                    <span className="text-[10px] font-bold uppercase text-emerald-600">Créditos</span>
                    <p className="text-base font-bold tabular-nums text-emerald-700">R$ {formatBRL(form.total_credits)}</p>
                  </div>
                  <div className="p-3 rounded-xl border border-red-200 bg-red-50/50">
                    <span className="text-[10px] font-bold uppercase text-red-600">Débitos</span>
                    <p className="text-base font-bold tabular-nums text-red-700">R$ {formatBRL(form.total_debits)}</p>
                  </div>
                  <div className="p-3 rounded-xl border border-brand-200 bg-brand-50/50">
                    <span className="text-[10px] font-bold uppercase text-brand-600">Total em Caixa</span>
                    <p className="text-base font-bold tabular-nums text-brand-700">R$ {formatBRL(form.total_em_caixa)}</p>
                  </div>
                </div>
              )}

              {/* Detailed breakdown — only in PDF mode */}
              {!manualMode && (
                <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Detalhes extraídos do PDF</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-600">Vendas</span>
                      <span className="font-semibold tabular-nums text-slate-900">R$ {formatBRL(form.total_sales)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-600">Entradas / Receitas</span>
                      <span className="font-semibold tabular-nums text-slate-900">R$ {formatBRL(form.total_income)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-600">Cofre</span>
                      <span className="font-semibold tabular-nums text-slate-900">R$ {formatBRL(form.safe_amount)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-600">Caixa (Gaveta)</span>
                      <span className="font-semibold tabular-nums text-slate-900">R$ {formatBRL(form.cash_drawer)}</span>
                    </div>
                    <div className="flex justify-between py-1 font-bold border-t-2 border-slate-300 pt-2">
                      <span className="text-slate-700">Saldo (Vendas - Entradas)</span>
                      <span className={`tabular-nums ${form.total_sales - form.total_income >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>R$ {formatBRL(form.total_sales - form.total_income)}</span>
                    </div>
                  </div>
                </div>
              )}

              {manualMode && (
                <div className="bg-slate-50 rounded-lg p-4 flex justify-between items-center font-bold border-t-2 border-slate-300">
                  <span className="text-slate-700">
                    Saldo Geral (Cofre + Caixa + Pix + Retiradas − Depósitos)
                  </span>
                  <span
                    className={`tabular-nums text-lg ${
                      (form.safe_amount + form.cash_drawer + totalPix + totalWithdrawals - parseBRL(form.deposit_amount)) >= 0
                        ? 'text-blue-700'
                        : 'text-red-700'
                    }`}
                  >
                    R${' '}
                    {formatBRL(
                      form.safe_amount + form.cash_drawer + totalPix + totalWithdrawals - parseBRL(form.deposit_amount),
                    )}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>Envie um PDF para extrair automaticamente os valores. Você poderá revisar antes de salvar.</span>
            </div>
          )}

          {/* Pix Externos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-sm font-medium text-slate-700">Pix Externos</span>
              <Button size="sm" variant="secondary" onClick={addPix}><PlusCircle size={14} /> Adicionar</Button>
            </div>
            {pixExternals.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Nenhum pix externo adicionado.</p>
            ) : (
              <div className="space-y-2">
                {pixExternals.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <input type="text" value={p.description} onChange={(e) => updatePix(p.id, 'description', e.target.value)} placeholder="Descrição" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
                    <input type="text" inputMode="numeric" value={p.amount ? maskBRL(String(Math.round(p.amount * 100))) : ''} onChange={(e) => updatePix(p.id, 'amount', e.target.value)} placeholder="R$ 0,00" className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm text-right focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
                    <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-300 cursor-pointer hover:bg-slate-50 transition-colors">
                      <input type="checkbox" checked={!!p.checked} onChange={(e) => updatePix(p.id, 'checked', e.target.checked)} className="w-4 h-4 accent-brand-600" />
                      <span className="text-xs font-medium text-slate-600">Conferido</span>
                    </label>
                    <button onClick={() => removePix(p.id)} className="text-slate-400 hover:text-red-500 p-2"><Trash size={16} /></button>
                  </div>
                ))}
                <div className="flex justify-end text-sm font-medium text-slate-700 pt-1">Total Pix: R$ {formatBRL(totalPix)}</div>
              </div>
            )}
          </div>

          {/* Retiradas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-sm font-medium text-slate-700">Retiradas</span>
              <Button size="sm" variant="secondary" onClick={addWithdrawal}><PlusCircle size={14} /> Adicionar</Button>
            </div>
            {withdrawals.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Nenhuma retirada adicionada.</p>
            ) : (
              <div className="space-y-2">
                {withdrawals.map((w) => (
                  <div key={w.id} className="flex items-center gap-2">
                    <input type="text" value={w.description} onChange={(e) => updateWithdrawal(w.id, 'description', e.target.value)} placeholder="Descrição" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
                    <input type="text" inputMode="numeric" value={w.amount ? maskBRL(String(Math.round(w.amount * 100))) : ''} onChange={(e) => updateWithdrawal(w.id, 'amount', e.target.value)} placeholder="R$ 0,00" className="w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm text-right focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
                    <button onClick={() => removeWithdrawal(w.id)} className="text-slate-400 hover:text-red-500 p-2"><Trash size={16} /></button>
                  </div>
                ))}
                <div className="flex justify-end text-sm font-medium text-slate-700 pt-1">Total Retiradas: R$ {formatBRL(totalWithdrawals)}</div>
              </div>
            )}
          </div>

          {manualMode ? (
            (() => {
              const manualSaldoFinal = form.total_sales - form.total_income;
              const manualSaldoGeral =
                form.safe_amount + form.cash_drawer + totalPix + totalWithdrawals - parseBRL(form.deposit_amount);
              const manualDiff = manualSaldoGeral - manualSaldoFinal;
              const surplusVal = manualDiff > 0 ? manualDiff : 0;
              const shortageVal = manualDiff < 0 ? Math.abs(manualDiff) : 0;
              return (
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Sobras" type="text" value={surplusVal ? maskBRL(String(Math.round(surplusVal * 100))) : ''} onChange={() => {}} disabled placeholder="R$ 0,00" />
                  <Input label="Faltas" type="text" value={shortageVal ? maskBRL(String(Math.round(shortageVal * 100))) : ''} onChange={() => {}} disabled placeholder="R$ 0,00" />
                </div>
              );
            })()
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <MoneyInput label="Sobras" value={form.surplus} onChange={(v) => setForm({ ...form, surplus: v })} />
              <MoneyInput label="Faltas" value={form.shortage} onChange={(v) => setForm({ ...form, shortage: v })} />
            </div>
          )}

          {/* Depósito — visível em ambos os modos */}
          <div className="grid grid-cols-2 gap-4">
            {manualMode ? (
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold uppercase text-slate-500">Depósito</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.deposit_amount ? maskBRL(String(Math.round(parseBRL(form.deposit_amount) * 100))) : ''}
                  onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })}
                  placeholder="R$ 0,00"
                  className="w-full mt-1 text-base font-bold tabular-nums text-slate-900 bg-transparent border-b border-slate-200 focus:border-slate-500 focus:outline-none"
                />
              </div>
            ) : (
              <MoneyInput
                label="Depósitos"
                value={form.deposit_amount}
                onChange={(v) => setForm({ ...form, deposit_amount: v })}
              />
            )}
          </div>

          <Input label="Justificativa" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Justificativa do fechamento" />
          <Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v as 'open' | 'closed' })} options={[{ value: 'open', label: 'Aberto' }, { value: 'closed', label: 'Fechado' }]} />

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || (!manualMode && extracting)}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
