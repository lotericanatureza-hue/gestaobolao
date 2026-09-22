import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Upload, FileText, Download, PlusCircle, Trash, Lock, Unlock, Loader2, CheckCircle, AlertCircle, User, ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from './ui';
import { formatBRL } from '../lib/format';
import type { FinCashClosing, FinEmployee, PixExternal, Branch } from '../lib/types';

interface ExtractedData {
  closing_date: string;
  total_sales: number;
  total_income: number;
  safe_amount: number;
  cash_drawer: number;
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
    safe_amount: parseBRLValue(fullText, [
      'cofre[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'valor\\s*(?:do\\s*)?cofre[:\\s]*R?\\$?\\s*([\\d.,]+)',
    ]),
    cash_drawer: parseBRLValue(fullText, [
      'caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'valor\\s*(?:em\\s*)?caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
      'fundo\\s*(?:de\\s*)?caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
    ]),
  };
}

const todayStr = () => new Date().toISOString().split('T')[0];

const emptyForm = {
  closing_date: todayStr(),
  total_sales: 0,
  total_income: 0,
  safe_amount: 0,
  cash_drawer: 0,
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [existingPdf, setExistingPdf] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(false);
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

  const openNew = (employee: FinEmployee) => {
    setEditing(null);
    setModalEmployee(employee);
    setForm({ ...emptyForm, closing_date: fDate });
    setPixExternals([]);
    setPdfFile(null);
    setExistingPdf(null);
    setExtracted(false);
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
      safe_amount: Number(c.safe_amount),
      cash_drawer: Number(c.cash_drawer),
      surplus: String(c.surplus),
      shortage: String(c.shortage),
      notes: c.notes ?? '',
      status: c.status,
    });
    setPixExternals(c.pix_externals ?? []);
    setPdfFile(null);
    setExistingPdf(c.pdf_path);
    setExtracted(true);
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
        safe_amount: data.safe_amount,
        cash_drawer: data.cash_drawer,
      }));
      setExtracted(true);
    } catch (err) {
      setError('Não foi possível extrair dados do PDF. Verifique se o arquivo é válido.');
      console.error(err);
    }
    setExtracting(false);
  };

  const addPix = () => setPixExternals([...pixExternals, { id: crypto.randomUUID(), description: '', amount: 0 }]);
  const updatePix = (id: string, field: 'description' | 'amount', value: string) => {
    setPixExternals(pixExternals.map((p) => p.id === id ? { ...p, [field]: field === 'amount' ? parseFloat(value.replace(',', '.')) || 0 : value } : p));
  };
  const removePix = (id: string) => setPixExternals(pixExternals.filter((p) => p.id !== id));
  const totalPix = pixExternals.reduce((s, p) => s + Number(p.amount), 0);

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

    const payload = {
      branch_id: selectedBranch,
      employee_id: modalEmployee.id,
      closing_date: form.closing_date,
      total_sales: form.total_sales,
      total_income: form.total_income,
      pix_externals: pixExternals as unknown as Record<string, unknown>[],
      total_pix_externals: totalPix,
      surplus: parseFloat(form.surplus.replace(',', '.')) || 0,
      shortage: parseFloat(form.shortage.replace(',', '.')) || 0,
      safe_amount: form.safe_amount,
      cash_drawer: form.cash_drawer,
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
    if (!confirm(`Excluir o fechamento de ${new Date(c.closing_date).toLocaleDateString('pt-BR')}?`)) return;
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
    const todayClosing = empClosings.find((c) => c.closing_date === fDate);
    const closedClosings = empClosings.filter((c) => c.status === 'closed');
    const pendingClosings = empClosings.filter((c) => c.status === 'open');
    return { employee: emp, todayClosing, closedClosings, pendingClosings, allClosings: empClosings };
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
          {employeeData.map(({ employee, todayClosing, closedClosings, pendingClosings }) => {
            const isExpanded = expandedEmp === employee.id;
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
                    {/* Today's action */}
                    <div className="bg-slate-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                          <Calendar size={16} /> Caixa do dia — {new Date(fDate).toLocaleDateString('pt-BR')}
                        </h4>
                        <Button size="sm" onClick={() => openNew(employee)}>
                          <Plus size={14} /> Fechar Caixa
                        </Button>
                      </div>
                      {todayClosing ? (
                        <div className="bg-white rounded-lg p-4 border border-slate-200">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                            <div><span className="text-slate-500">Vendas:</span> <span className="font-semibold text-slate-900">R$ {formatBRL(Number(todayClosing.total_sales))}</span></div>
                            <div><span className="text-slate-500">Pix Ext.:</span> <span className="font-semibold text-brand-600">R$ {formatBRL(Number(todayClosing.total_pix_externals))}</span></div>
                            <div><span className="text-slate-500">Sobra:</span> <span className="font-semibold text-emerald-600">R$ {formatBRL(Number(todayClosing.surplus))}</span></div>
                            <div><span className="text-slate-500">Falta:</span> <span className="font-semibold text-red-600">R$ {formatBRL(Number(todayClosing.shortage))}</span></div>
                          </div>
                          <div className="flex items-center gap-2">
                            {todayClosing.pdf_path && (
                              <button onClick={() => downloadPdf(todayClosing.pdf_path!)} className="text-brand-600 hover:text-brand-700 flex items-center gap-1 text-sm">
                                <FileText size={14} /> Ver PDF
                              </button>
                            )}
                            <button onClick={() => toggleStatus(todayClosing)} className="text-slate-500 hover:text-slate-700 flex items-center gap-1 text-sm">
                              {todayClosing.status === 'closed' ? <><Unlock size={14} /> Reabrir</> : <><Lock size={14} /> Fechar</>}
                            </button>
                            <button onClick={() => openEdit(todayClosing)} className="text-brand-600 hover:text-brand-700 flex items-center gap-1 text-sm">
                              <Pencil size={14} /> Editar
                            </button>
                            <button onClick={() => removeClosing(todayClosing)} className="text-red-500 hover:text-red-700 flex items-center gap-1 text-sm">
                              <Trash2 size={14} /> Excluir
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">Nenhum caixa fechado para este funcionário no dia selecionado. Clique em "Fechar Caixa" para criar.</p>
                      )}
                    </div>

                    {/* Pending closings */}
                    {pendingClosings.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-2">
                          <AlertCircle size={16} /> Caixas Pendentes ({pendingClosings.length})
                        </h4>
                        <div className="space-y-2">
                          {pendingClosings.map((c) => (
                            <div key={c.id} className="flex items-center justify-between bg-amber-50 rounded-lg p-3 border border-amber-200">
                              <div className="flex items-center gap-3">
                                <Badge color="amber"><Unlock size={12} className="mr-1" /> Pendente</Badge>
                                <span className="text-sm text-slate-700">{new Date(c.closing_date).toLocaleDateString('pt-BR')}</span>
                                <span className="text-sm text-slate-500">Vendas: R$ {formatBRL(Number(c.total_sales))}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {c.pdf_path && <button onClick={() => downloadPdf(c.pdf_path!)} className="text-brand-600 text-sm flex items-center gap-1"><FileText size={14} /> PDF</button>}
                                <button onClick={() => openEdit(c)} className="text-brand-600 text-sm"><Pencil size={14} /></button>
                                <button onClick={() => removeClosing(c)} className="text-red-500 text-sm"><Trash2 size={14} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Closed closings */}
                    {closedClosings.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
                          <Lock size={16} /> Caixas Fechados ({closedClosings.length})
                        </h4>
                        <div className="space-y-2">
                          {closedClosings.slice(0, 10).map((c) => (
                            <details key={c.id} className="bg-slate-50 rounded-lg border border-slate-200">
                              <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-100 transition-colors rounded-lg">
                                <div className="flex items-center gap-3">
                                  <Badge color="blue"><Lock size={12} className="mr-1" /> Fechado</Badge>
                                  <span className="text-sm text-slate-700">{new Date(c.closing_date).toLocaleDateString('pt-BR')}</span>
                                  <span className="text-sm text-slate-500">Vendas: R$ {formatBRL(Number(c.total_sales))}</span>
                                </div>
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  {c.pdf_path && <button onClick={() => downloadPdf(c.pdf_path!)} className="text-brand-600 text-sm flex items-center gap-1"><FileText size={14} /> PDF</button>}
                                  <button onClick={() => toggleStatus(c)} className="text-slate-500 text-sm" title="Reabrir"><Unlock size={14} /></button>
                                  <button onClick={() => openEdit(c)} className="text-brand-600 text-sm"><Pencil size={14} /></button>
                                  <button onClick={() => removeClosing(c)} className="text-red-500 text-sm"><Trash2 size={14} /></button>
                                </div>
                              </summary>
                              <div className="px-3 pb-3 pt-1 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                <div><span className="text-slate-500">Entradas:</span> <span className="font-medium">R$ {formatBRL(Number(c.total_income))}</span></div>
                                <div><span className="text-slate-500">Pix Ext.:</span> <span className="font-medium text-brand-600">R$ {formatBRL(Number(c.total_pix_externals))}</span></div>
                                <div><span className="text-slate-500">Sobra:</span> <span className="font-medium text-emerald-600">R$ {formatBRL(Number(c.surplus))}</span></div>
                                <div><span className="text-slate-500">Falta:</span> <span className="font-medium text-red-600">R$ {formatBRL(Number(c.shortage))}</span></div>
                                <div><span className="text-slate-500">Cofre:</span> <span className="font-medium">R$ {formatBRL(Number(c.safe_amount))}</span></div>
                                <div><span className="text-slate-500">Caixa:</span> <span className="font-medium">R$ {formatBRL(Number(c.cash_drawer))}</span></div>
                                {c.notes && <div className="col-span-2"><span className="text-slate-500">Obs.:</span> <span className="text-slate-600">{c.notes}</span></div>}
                              </div>
                            </details>
                          ))}
                          {closedClosings.length > 10 && (
                            <p className="text-xs text-slate-400 text-center pt-1">Mostrando 10 de {closedClosings.length} caixas fechados</p>
                          )}
                        </div>
                      </div>
                    )}

                    {todayClosing === null && pendingClosings.length === 0 && closedClosings.length === 0 && (
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

          {/* PDF Upload / Extraction */}
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

          {/* Extracted data (read-only) */}
          {extracted && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Dados extraídos do PDF</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Vendas</span><span className="font-medium text-slate-900">R$ {formatBRL(form.total_sales)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Entradas</span><span className="font-medium text-slate-900">R$ {formatBRL(form.total_income)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Cofre</span><span className="font-medium text-slate-900">R$ {formatBRL(form.safe_amount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Caixa</span><span className="font-medium text-slate-900">R$ {formatBRL(form.cash_drawer)}</span></div>
              </div>
            </div>
          )}

          {!extracted && !extracting && (
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
                    <input type="text" value={String(p.amount)} onChange={(e) => updatePix(p.id, 'amount', e.target.value)} placeholder="0,00" className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm text-right focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none" />
                    <button onClick={() => removePix(p.id)} className="text-slate-400 hover:text-red-500 p-2"><Trash size={16} /></button>
                  </div>
                ))}
                <div className="flex justify-end text-sm font-medium text-slate-700 pt-1">Total Pix: R$ {formatBRL(totalPix)}</div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Sobras" type="text" value={form.surplus} onChange={(v) => setForm({ ...form, surplus: v })} placeholder="0,00" />
            <Input label="Faltas" type="text" value={form.shortage} onChange={(v) => setForm({ ...form, shortage: v })} placeholder="0,00" />
          </div>

          <Input label="Observações" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Notas adicionais" />
          <Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v as 'open' | 'closed' })} options={[{ value: 'open', label: 'Aberto' }, { value: 'closed', label: 'Fechado' }]} />

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || extracting}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
