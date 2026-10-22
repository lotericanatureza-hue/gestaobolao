import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, ChevronDown, ChevronRight, FileJson, Lock, Trash2, Unlock, Upload } from 'lucide-react';
import { createWorker, PSM } from 'tesseract.js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner } from './ui';
import { formatBRL, formatDateBR } from '../lib/format';
import { preprocessImage } from '../lib/imageProcessing';
import type { BolaoClosingItem, Branch, FinBolaoClosing, Profile } from '../lib/types';

/** O JSON é a fonte de verdade. Nenhum campo é calculado a partir da quantidade C.T/C.V. */
type Jogo = {
  concurso: string;
  cotas: string; // C.T/C.V, como impresso no comprovante
  valor_bolao: number;
  percentual_taxa: number;
  valor_taxa: number;
  secao: 'com_tarifa' | 'sem_tarifa';
};
type Extracao = {
  esquema: 'caixa-bolao-v1';
  data_referencia: string; // YYYY-MM-DD
  revisao: string;
  operador_caixa: string;
  proprietario: string;
  jogos: Jogo[];
  resumo: { quantidade_boloes: number; valor_total_cotas: number; valor_total_taxas: number; valor_total_com_taxas: number };
  conferencia: { total_impresso_cotas: number | null; total_impresso_taxas: number | null; avisos: string[] };
};
const today = () => new Date().toLocaleDateString('en-CA');
const money = (v: number) => Math.round((v + Number.EPSILON) * 100);
const fromCents = (v: number) => Math.round(v) / 100;
function numberBR(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const raw = value.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!raw) return NaN;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}
function createExtraction(jogos: Jogo[], meta: Partial<Extracao> = {}, impresso?: { cotas: number | null; taxas: number | null }, avisos: string[] = []): Extracao {
  const cotas = fromCents(jogos.reduce((s, j) => s + money(j.valor_bolao), 0));
  const taxas = fromCents(jogos.reduce((s, j) => s + money(j.valor_taxa), 0));
  return {
    esquema: 'caixa-bolao-v1', data_referencia: meta.data_referencia ?? today(),
    revisao: meta.revisao ?? '', operador_caixa: meta.operador_caixa ?? '', proprietario: meta.proprietario ?? '',
    jogos,
    resumo: { quantidade_boloes: jogos.length, valor_total_cotas: cotas, valor_total_taxas: taxas, valor_total_com_taxas: fromCents(money(cotas) + money(taxas)) },
    conferencia: { total_impresso_cotas: impresso?.cotas ?? null, total_impresso_taxas: impresso?.taxas ?? null, avisos },
  };
}
function parseDate(text: string): string {
  const m = text.match(/(?:DATA\s+DE\s+REFER[EÊ]NCIA[^\d]*)?(\d{2})\s*[/.\-]\s*(\d{2})\s*[/.\-]\s*(20\d{2})/i);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : today();
}
/** Leitura estruturada do RESUMO DE BOLÃO, mantendo linhas repetidas. */
function parseCaixaText(text: string): Extracao {
  const clean = text.toUpperCase().replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
  const linhas = clean.split(/\r?\n/).map(x => x.replace(/\s+/g, ' ').trim());
  const jogos: Jogo[] = [];
  const avisos: string[] = [];
  let secao: Jogo['secao'] = 'com_tarifa';
  let cotasImpressas: number | null = null;
  let taxasImpressas: number | null = null;
  const moeda = '(?:\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2})';
  const linhaJogo = new RegExp(`^\\+?([A-Z][A-Z0-9]*-\\d{2,6})\\s+(\\d{1,3}\\s*\\/\\s*\\d{1,3})\\s+(${moeda})\\s+(${moeda})(?:\\s+(${moeda}))?\\s*$`);
  const linhaTotal = new RegExp(`^TOTAL\\s+(${moeda})(?:\\s+(${moeda}))?\\s*$`);
  for (const [i, original] of linhas.entries()) {
    if (/BOL[AÃ]O CAIXA\s*-\s*SEM TARIFA/.test(original)) { secao = 'sem_tarifa'; continue; }
    if (/BOL[AÃ]O CAIXA\s*-\s*COM TARIFA/.test(original)) { secao = 'com_tarifa'; continue; }
    const total = original.match(linhaTotal);
    if (total && secao === 'com_tarifa') {
      cotasImpressas = numberBR(total[1]);
      taxasImpressas = total[2] ? numberBR(total[2]) : null;
      continue;
    }
    // Corrige apenas confusões de OCR em códigos; não altera valores monetários.
    const linha = original.replace(/^\+?([A-Z][A-Z0-9]*)\s*-\s*(\d{2,6})/, '$1-$2');
    const match = linha.match(linhaJogo);
    if (match) {
      const v = numberBR(match[3]);
      const p = match[5] ? numberBR(match[4]) : 0;
      const t = match[5] ? numberBR(match[5]) : 0;
      if ([v, p, t].every(Number.isFinite)) jogos.push({ concurso: match[1], cotas: match[2].replace(/\s/g, ''), valor_bolao: v, percentual_taxa: p, valor_taxa: t, secao });
    } else if (/^\+?[A-Z][A-Z0-9]*-\d{2,6}\s+\d+\s*\/\s*\d+/.test(linha)) {
      avisos.push(`Linha ${i + 1} não reconhecida: ${original}`);
    }
  }
  const revision = clean.match(/\bREV\s+([\d.\-]+)/);
  const operator = clean.match(/\bOPERADOR\s*:\s*([A-Z0-9]+)/);
  const owner = clean.match(/\bPROPRIETARIO\s*:\s*([^\n]+)/);
  const extracao = createExtraction(jogos, {
    data_referencia: parseDate(clean), revisao: revision?.[1] ?? '', operador_caixa: operator?.[1] ?? '', proprietario: owner?.[1]?.trim() ?? '',
  }, { cotas: cotasImpressas, taxas: taxasImpressas }, avisos);
  return extracao;
}
/** Aceita tanto JSON completo quanto o JSON simplificado da extração da foto. */
function parseJsonInput(raw: string): Extracao {
  const obj: unknown = JSON.parse(raw);
  if (!obj || typeof obj !== 'object') throw new Error('O conteúdo precisa ser um objeto JSON.');
  const data = obj as Record<string, unknown>;
  if (!Array.isArray(data.jogos) || !data.jogos.length) throw new Error('O JSON deve conter um array jogos não vazio.');
  const jogos: Jogo[] = data.jogos.map((item: unknown, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Jogo ${index + 1} inválido.`);
    const j = item as Record<string, unknown>;
    const concurso = String(j.concurso ?? '').trim().toUpperCase();
    const cotas = String(j.cotas ?? '').trim();
    const valor_bolao = numberBR(j.valor_bolao);
    const percentual_taxa = numberBR(j.percentual_taxa ?? 0);
    const valor_taxa = numberBR(j.valor_taxa ?? 0);
    if (!/^[+A-Z0-9]+-\d{2,6}$/.test(concurso) || !/^\d+\/\d+$/.test(cotas) ||
      ![valor_bolao, percentual_taxa, valor_taxa].every(Number.isFinite) ||
      valor_bolao < 0 || valor_taxa < 0 || percentual_taxa < 0 || percentual_taxa > 100) {
      throw new Error(`Jogo ${index + 1}: confira concurso, cotas e valores.`);
    }
    return { concurso, cotas, valor_bolao, percentual_taxa, valor_taxa, secao: j.secao === 'sem_tarifa' ? 'sem_tarifa' : 'com_tarifa' };
  });
  const resumo = (data.resumo && typeof data.resumo === 'object') ? data.resumo as Record<string, unknown> : {};
  const conf = (data.conferencia && typeof data.conferencia === 'object') ? data.conferencia as Record<string, unknown> : {};
  const getPrinted = (v: unknown) => v == null ? null : numberBR(v);
  const printedCotas = getPrinted(conf.total_impresso_cotas ?? resumo.valor_total_cotas ?? data.total_cotas);
  const printedTaxas = getPrinted(conf.total_impresso_taxas ?? resumo.valor_total_taxas ?? data.total_taxas);
  if ((printedCotas !== null && !Number.isFinite(printedCotas)) || (printedTaxas !== null && !Number.isFinite(printedTaxas))) throw new Error('Totais informados inválidos.');
  return createExtraction(jogos, {
    data_referencia: String(data.data_referencia ?? today()), revisao: String(data.revisao ?? ''),
    operador_caixa: String(data.operador_caixa ?? data.operador ?? ''), proprietario: String(data.proprietario ?? ''),
  }, { cotas: printedCotas, taxas: printedTaxas }, Array.isArray(conf.avisos) ? conf.avisos.map(String) : []);
}
function validation(data: Extracao): string[] {
  const errors = [...data.conferencia.avisos];
  if (!data.jogos.length) errors.push('Nenhum jogo identificado.');
  if (data.conferencia.total_impresso_cotas === null || data.conferencia.total_impresso_taxas === null) errors.push('Totais impressos ausentes: confirme manualmente com o comprovante antes de fechar.');
  if (data.conferencia.total_impresso_cotas !== null && money(data.resumo.valor_total_cotas) !== money(data.conferencia.total_impresso_cotas)) errors.push('Total das cotas diferente do comprovante.');
  if (data.conferencia.total_impresso_taxas !== null && money(data.resumo.valor_total_taxas) !== money(data.conferencia.total_impresso_taxas)) errors.push('Total das taxas diferente do comprovante.');
  for (const [i, j] of data.jogos.entries()) {
    if (j.secao === 'sem_tarifa' && j.valor_taxa !== 0) errors.push(`Jogo ${i + 1}: seção sem tarifa possui taxa.`);
    // Caixa pode truncar um centavo; diferenças maiores devem ser revisadas.
    if (Math.abs(money(j.valor_bolao * j.percentual_taxa / 100) - money(j.valor_taxa)) > 2) errors.push(`Jogo ${i + 1}: tarifa inconsistente.`);
  }
  return errors;
}
function toStored(data: Extracao, drawDate: string): BolaoClosingItem[] {
  return data.jogos.map((j, index) => {
    const [modality, ...parts] = j.concurso.replace(/^\+/, '').split('-');
    const shares = Number(j.cotas.split('/')[0]);
    return {
      id: crypto.randomUUID(), product_id: '', product_name: j.concurso, slug: '', shares,
      price_per_share: shares ? j.valor_bolao / shares : 0,
      fee_per_share: shares ? j.valor_taxa / shares : 0,
      total: fromCents(money(j.valor_bolao) + money(j.valor_taxa)),
      modality, contest: parts.join('-'), quantity: j.cotas,
      quota_value: j.valor_bolao, fee_value: j.valor_taxa,
      fee_percentage: j.percentual_taxa, draw_date: drawDate,
      validated: true, report_section: j.secao === 'com_tarifa' ? 'Bolão caixa - com tarifa de serviço' : 'Bolão caixa - sem tarifa de serviço',
      report_kind: 'bolao', source_line: `JSON jogo ${index + 1}`,
    } as BolaoClosingItem;
  });
}
function storedToJson(closing: FinBolaoClosing): Extracao {
  const jogos: Jogo[] = (closing.items ?? []).map(item => ({
    concurso: `${item.modality ?? item.product_name?.split('-')[0] ?? ''}-${item.contest ?? item.product_name?.split('-').slice(1).join('-') ?? ''}`,
    cotas: item.quantity ?? String(item.shares ?? ''),
    valor_bolao: Number(item.quota_value ?? 0), percentual_taxa: Number(item.fee_percentage ?? 0),
    valor_taxa: Number(item.fee_value ?? 0),
    secao: item.report_section?.includes('sem tarifa') ? 'sem_tarifa' : 'com_tarifa',
  }));
  return createExtraction(jogos, { data_referencia: closing.closing_date });
}

export function FinancialBolaoClosing() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const canManageAll = isAdmin || profile?.role === 'supervisor';
  const [closings, setClosings] = useState<FinBolaoClosing[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [filterDate, setFilterDate] = useState(today());
  const [viewMode, setViewMode] = useState<'day' | 'month'>('day');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinBolaoClosing | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [closingDate, setClosingDate] = useState(today());
  const [drawDate, setDrawDate] = useState(today());
  const [operatorId, setOperatorId] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [data, setData] = useState<Extracao | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void supabase.from('branches').select('*').order('name').then(({ data: rows }) => setBranches((rows ?? []) as Branch[]));
    setSelectedBranch(isAdmin ? '' : profile?.branch_id ?? '');
  }, [isAdmin, profile?.branch_id]);
  const refresh = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('fin_bolao_closing').select('*, operator:profiles(*), branch:branches(*)').order('closing_date', { ascending: false });
    if (!isAdmin) {
      if (!profile?.branch_id) { setClosings([]); setLoading(false); return; }
      query = query.eq('branch_id', profile.branch_id);
    } else if (selectedBranch) query = query.eq('branch_id', selectedBranch);
    const { data: rows, error: queryError } = await query;
    if (queryError) setError(queryError.message);
    setClosings((rows ?? []) as FinBolaoClosing[]);
    if (canManageAll) {
      let q = supabase.from('profiles').select('*').eq('role', 'operator').eq('active', true).order('name');
      if (!isAdmin && profile?.branch_id) q = q.eq('branch_id', profile.branch_id);
      if (isAdmin && selectedBranch) q = q.eq('branch_id', selectedBranch);
      const { data: people } = await q;
      setOperators((people ?? []) as Profile[]);
    }
    setLoading(false);
  }, [canManageAll, isAdmin, profile?.branch_id, selectedBranch]);
  useEffect(() => { void refresh(); }, [refresh]);

  const openNew = () => {
    setEditing(null); setClosingDate(filterDate); setDrawDate(filterDate);
    setOperatorId(canManageAll ? '' : profile?.id ?? '');
    setData(null); setJsonText(''); setSourceName(''); setOcrText(''); setNotes('');
    setStatus('open'); setError(''); setMessage(''); setModalOpen(true);
  };
  const openEdit = (closing: FinBolaoClosing) => {
    setEditing(closing); setClosingDate(closing.closing_date);
    setDrawDate(closing.items?.[0]?.draw_date ?? closing.closing_date);
    setOperatorId(closing.operator_id); setNotes(closing.notes ?? ''); setStatus(closing.status);
    setSourceName(closing.source_report_name ?? ''); setOcrText(closing.ocr_text ?? '');
    let restored = storedToJson(closing);
    try {
      const previous = JSON.parse(closing.ocr_text ?? '{}');
      if (previous.extracao?.jogos) restored = parseJsonInput(JSON.stringify(previous.extracao));
    } catch { /* Fechamentos antigos podem guardar texto OCR simples. */ }
    setData(restored); setJsonText(JSON.stringify(restored, null, 2));
    setError(''); setMessage('Dados recuperados. Para fechar, confira os totais impressos no JSON.'); setModalOpen(true);
  };
  const importJson = () => {
    try {
      const parsed = parseJsonInput(jsonText);
      setData(parsed); setJsonText(JSON.stringify(parsed, null, 2)); setError('');
      setMessage(`${parsed.jogos.length} jogos importados. Confira a validação e os totais.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'JSON inválido.'); }
  };
  const runOcr = async (files: File[]) => {
    setBusy(true); setError(''); setMessage('Lendo comprovante...');
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
      worker = await createWorker('por');
      let allGames: Jogo[] = []; let printedQuota = 0; let printedFee = 0;
      let quotaSeen = false; let feeSeen = false;
      const warnings: string[] = []; const texts: string[] = [];
      let metadata: Partial<Extracao> = {};
      for (const file of files) {
        const pre = await preprocessImage(file).catch(() => ({ grayscale: file, binarized: file }));
        let best: { extracted: Extracao; text: string; score: number } | null = null;
        for (const image of [pre.grayscale, pre.binarized]) {
          for (const mode of [PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT]) {
            await worker.setParameters({ tessedit_pageseg_mode: mode, preserve_interword_spaces: '1' });
            const result = await worker.recognize(image);
            const extracted = parseCaixaText(result.data.text);
            const score = extracted.jogos.length * 100 - extracted.conferencia.avisos.length * 5 +
              (extracted.conferencia.total_impresso_cotas !== null ? 20 : 0) +
              (extracted.conferencia.total_impresso_taxas !== null ? 20 : 0);
            if (!best || score > best.score) best = { extracted, text: result.data.text, score };
          }
        }
        if (!best) continue;
        const parsed = best.extracted;
        metadata = { ...metadata, data_referencia: parsed.data_referencia, revisao: parsed.revisao || metadata.revisao,
          operador_caixa: parsed.operador_caixa || metadata.operador_caixa, proprietario: parsed.proprietario || metadata.proprietario };
        allGames = allGames.concat(parsed.jogos); // fotos distintas são tratadas como relatórios distintos
        warnings.push(...parsed.conferencia.avisos.map(a => `${file.name}: ${a}`));
        if (parsed.conferencia.total_impresso_cotas !== null) { quotaSeen = true; printedQuota += money(parsed.conferencia.total_impresso_cotas); }
        if (parsed.conferencia.total_impresso_taxas !== null) { feeSeen = true; printedFee += money(parsed.conferencia.total_impresso_taxas); }
        texts.push(best.text);
      }
      const extracted = createExtraction(allGames, metadata, {
        cotas: quotaSeen ? fromCents(printedQuota) : null, taxas: feeSeen ? fromCents(printedFee) : null,
      }, warnings);
      setData(extracted); setJsonText(JSON.stringify(extracted, null, 2));
      setOcrText(texts.join('\n\n--- PRÓXIMA FOTO ---\n\n'));
      setSourceName(files.map(f => f.name).join(', '));
      setMessage(`${extracted.jogos.length} jogos reconhecidos. Revise o JSON e os totais antes de fechar.`);
      if (!allGames.length) setError('Nenhum jogo reconhecido. Corrija o JSON manualmente ou envie uma foto mais nítida.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao ler as fotos.'); }
    finally { if (worker) await worker.terminate(); setBusy(false); }
  };
  const issues = useMemo(() => data ? validation(data) : [], [data]);
  const save = async () => {
    if (busy) return;
    let parsed: Extracao;
    try { parsed = parseJsonInput(jsonText); } catch (e) { setError(e instanceof Error ? e.message : 'JSON inválido.'); return; }
    const problems = validation(parsed);
    if (problems.length) { setData(parsed); setError(`Não é possível salvar: ${problems.join(' | ')}`); return; }
    const selectedOperator = canManageAll ? operatorId : profile?.id ?? '';
    const operator = operators.find(p => p.id === selectedOperator);
    const branchId = operator?.branch_id ?? (isAdmin ? selectedBranch : profile?.branch_id) ?? '';
    if (!selectedOperator || !branchId) { setError('Selecione um operador vinculado a uma filial.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(closingDate) || !/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) { setError('Informe as datas do fechamento e sorteio.'); return; }
    setBusy(true); setError('');
    const payload = {
      operator_id: selectedOperator, branch_id: branchId, closing_date: closingDate,
      items: toStored(parsed, drawDate) as unknown as Record<string, unknown>[],
      total_cotas: parsed.jogos.reduce((s, j) => s + Number(j.cotas.split('/')[0]), 0),
      total_value: parsed.resumo.valor_total_com_taxas, total_fee: parsed.resumo.valor_total_taxas,
      pix_externals: editing?.pix_externals ?? [], total_pix_externals: editing?.total_pix_externals ?? 0,
      owed_amounts: editing?.owed_amounts ?? [], total_owed: editing?.total_owed ?? 0,
      notes: notes.trim() || null, status, source_report_name: sourceName || null,
      // Guarda o JSON validado como fonte de verdade, sem migração de banco.
      ocr_text: JSON.stringify({ extracao: parsed, texto_original: ocrText }),
    };
    const result = editing ? await supabase.from('fin_bolao_closing').update(payload).eq('id', editing.id)
      : await supabase.from('fin_bolao_closing').insert(payload);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setModalOpen(false); await refresh();
  };
  const remove = async (closing: FinBolaoClosing) => {
    if (!window.confirm(`Excluir fechamento de ${formatDateBR(closing.closing_date)}?`)) return;
    const { error: err } = await supabase.from('fin_bolao_closing').delete().eq('id', closing.id);
    if (err) setError(err.message); else await refresh();
  };
  const toggle = async (closing: FinBolaoClosing) => {
    const { error: err } = await supabase.from('fin_bolao_closing').update({ status: closing.status === 'open' ? 'closed' : 'open' }).eq('id', closing.id);
    if (err) setError(err.message); else await refresh();
  };
  const visible = closings.filter(c => viewMode === 'day' ? c.closing_date === filterDate : c.closing_date.startsWith(month));
  const total = visible.reduce((s, c) => s + Number(c.total_value ?? 0), 0);
  const fees = visible.reduce((s, c) => s + Number(c.total_fee ?? 0), 0);
  if (loading && !closings.length) return <div className="flex justify-center py-20"><Spinner /></div>;
  return <div>
    <PageHeader title="Fechamento de Bolão — JSON" subtitle="Extração estruturada de comprovantes Caixa com conferência obrigatória dos totais"
      action={<div className="flex flex-wrap gap-2 items-center">
        {isAdmin && <Select value={selectedBranch} onChange={setSelectedBranch} options={[{ value: '', label: 'Todas as filiais' }, ...branches.map(b => ({ value: b.id, label: b.name }))]} />}
        <Select value={viewMode} onChange={v => setViewMode(v as 'day' | 'month')} options={[{ value: 'day', label: 'Dia' }, { value: 'month', label: 'Mês' }]} />
        {viewMode === 'day' ? <Input type="date" value={filterDate} onChange={setFilterDate} /> : <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-lg border p-2" />}
        <Button onClick={openNew}><Camera size={17} /> Novo fechamento</Button>
      </div>} />
    {error && !modalOpen && <p className="p-3 bg-red-50 text-red-700 rounded-lg mb-4">{error}</p>}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
      <Card className="p-4"><p>Fechamentos</p><strong>{visible.length}</strong></Card>
      <Card className="p-4"><p>Bolões sem taxas</p><strong>R$ {formatBRL(total - fees)}</strong></Card>
      <Card className="p-4"><p>Taxas / Total</p><strong>R$ {formatBRL(fees)} / R$ {formatBRL(total)}</strong></Card>
    </div>
    {!visible.length ? <Card><EmptyState icon={<FileJson size={42} />} title="Nenhum fechamento" description="Envie o comprovante ou cole o JSON extraído." /></Card> :
      <div className="space-y-3">{visible.map(c => <Card key={c.id} className="p-4">
        <button className="w-full flex justify-between text-left" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
          <span><strong>{formatDateBR(c.closing_date)}</strong> · {c.operator?.name ?? 'Operador'} <Badge color={c.status === 'closed' ? 'blue' : 'amber'}>{c.status === 'closed' ? 'Fechado' : 'Aberto'}</Badge></span>
          <span>R$ {formatBRL(Number(c.total_value))} {expanded === c.id ? <ChevronDown className="inline" size={16} /> : <ChevronRight className="inline" size={16} />}</span>
        </button>
        {expanded === c.id && <div className="mt-4 space-y-3">
          <pre className="bg-slate-50 rounded-lg p-3 overflow-auto text-xs max-h-80">{JSON.stringify(storedToJson(c), null, 2)}</pre>
          {(isAdmin || (profile?.role === 'supervisor' && c.branch_id === profile?.branch_id) || c.operator_id === profile?.id) && <div className="flex gap-2 flex-wrap justify-end">
            <Button size="sm" variant="secondary" onClick={() => openEdit(c)}>Editar JSON</Button>
            <Button size="sm" variant="secondary" onClick={() => void toggle(c)}>{c.status === 'closed' ? <Unlock size={14} /> : <Lock size={14} />}{c.status === 'closed' ? 'Reabrir' : 'Fechar'}</Button>
            <Button size="sm" variant="danger" onClick={() => void remove(c)}><Trash2 size={14} /> Excluir</Button>
          </div>}
        </div>}
      </Card>)}</div>}
    <Modal open={modalOpen} onClose={() => !busy && setModalOpen(false)} title={editing ? 'Editar fechamento em JSON' : 'Novo fechamento em JSON'} maxWidth="max-w-6xl">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="cursor-pointer rounded-lg bg-blue-700 text-white px-4 py-2 text-sm flex gap-2 items-center"><Upload size={16} /> {busy ? 'Lendo...' : 'Fotografar / enviar comprovante'}
            <input type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={busy} onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) void runOcr(f); e.target.value = ''; }} />
          </label>
          <label className="cursor-pointer rounded-lg border px-4 py-2 text-sm">Importar arquivo .json
            <input type="file" accept=".json,application/json" className="sr-only" disabled={busy} onChange={async e => { const f = e.target.files?.[0]; if (f) { setJsonText(await f.text()); setData(null); setMessage('Clique em Validar JSON.'); } e.target.value = ''; }} />
          </label>
        </div>
        <p className="text-sm text-slate-600">O OCR gera JSON diretamente a partir do padrão <strong>RESUMO DE BOLÃO</strong>. Não há formulário linha a linha. Revise o JSON antes de salvar; fotografias podem conter erros de reconhecimento.</p>
        <label className="block text-sm font-medium">JSON extraído / editável
          <textarea className="mt-2 w-full min-h-72 rounded-lg border border-slate-300 p-3 font-mono text-xs" spellCheck={false} value={jsonText} onChange={e => { setJsonText(e.target.value); setData(null); setMessage('JSON alterado: valide novamente.'); }} placeholder='{"data_referencia":"2026-10-21","jogos":[...],"resumo":{...}}' />
        </label>
        <Button variant="secondary" onClick={importJson} disabled={busy}><FileJson size={16} /> Validar JSON</Button>
        {message && <p className="text-sm text-slate-600">{message}</p>}
        {data && <div className="rounded-lg border p-4 space-y-2">
          <p><strong>{data.resumo.quantidade_boloes} bolões</strong> · Cotas: <strong>R$ {formatBRL(data.resumo.valor_total_cotas)}</strong> · Taxas: <strong>R$ {formatBRL(data.resumo.valor_total_taxas)}</strong> · Total: <strong>R$ {formatBRL(data.resumo.valor_total_com_taxas)}</strong></p>
          <p className="text-xs">Impresso no comprovante — cotas: {data.conferencia.total_impresso_cotas === null ? 'não encontrado' : `R$ ${formatBRL(data.conferencia.total_impresso_cotas)}`} · taxas: {data.conferencia.total_impresso_taxas === null ? 'não encontrado' : `R$ ${formatBRL(data.conferencia.total_impresso_taxas)}`}</p>
          {issues.length ? <div className="text-sm text-red-700"><strong>Conferência pendente:</strong><ul className="list-disc pl-5">{issues.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : <p className="text-sm text-green-700 font-semibold">Totais conferidos. JSON pronto para fechamento.</p>}
        </div>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Data do fechamento" type="date" value={closingDate} onChange={setClosingDate} />
          <Input label="Data do sorteio (todos os jogos)" type="date" value={drawDate} onChange={setDrawDate} />
          {canManageAll ? <Select label="Operador" value={operatorId} onChange={setOperatorId} options={operators.map(o => ({ value: o.id, label: o.name }))} placeholder="Selecione o operador" /> : <p className="text-sm">Operador: {profile?.name}</p>}
        </div>
        <Input label="Observações" value={notes} onChange={setNotes} />
        <Select label="Status" value={status} onChange={v => setStatus(v as 'open' | 'closed')} options={[{ value: 'open', label: 'Aberto' }, { value: 'closed', label: 'Fechado' }]} />
        {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancelar</Button><Button onClick={() => void save()} disabled={busy || !data || issues.length > 0}>{busy ? 'Processando...' : 'Salvar fechamento'}</Button></div>
      </div>
    </Modal>
  </div>;
}
