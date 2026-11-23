import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Calendar, Camera, ChevronDown, ChevronRight, FileJson, Lock, Percent, Plus, Trash2, Unlock, Upload, User } from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner } from './ui';
import { formatBRL, formatDateBR } from '../lib/format';
import { preprocessImage } from '../lib/imageProcessing';
import type { BolaoClosingItem, Branch, FinBolaoClosing, FinBolaoClosingConfig, FinCaixaBolao, Profile } from '../lib/types';

type Jogo = {
  concurso: string;
  cotas: string;
  valor_bolao: number;
  percentual_taxa: number;
  valor_taxa: number;
  secao: 'com_tarifa' | 'sem_tarifa';
};
type Extracao = {
  esquema: 'caixa-bolao-v1';
  data_referencia: string;
  revisao: string;
  operador_caixa: string;
  proprietario: string;
  jogos: Jogo[];
  resumo: { quantidade_boloes: number; valor_total_cotas: number; valor_total_taxas: number; valor_total_com_taxas: number };
  conferencia: { total_impresso_cotas: number | null; total_impresso_taxas: number | null; avisos: string[] };
};
type ManualGame = {
  id: string;
  game: string;
  value: string;
  tarifa: string;
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

function parseCaixaText(text: string): Extracao {
  const clean = text.toUpperCase().replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
  const lines = clean.split(/\r?\n/).map(x => x.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const moneyToken = /^(?:\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})$/;
  const moneySource = '(?:\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2}|\\d+\\.\\d{2})';
  const globalRow = new RegExp(`(\\+?[A-Z][A-Z0-9]*-\\d{2,6})\\s+(\\d{1,3}\\s*\\/\\s*\\d{1,3})\\s+(${moneySource})\\s+(${moneySource})\\s+(${moneySource})`, 'g');
  const games: Jogo[] = [];
  const warnings: string[] = [];
  let section: Jogo['secao'] = 'com_tarifa';
  let printedQuota: number | null = null;
  let printedFee: number | null = null;
  for (const [i, line] of lines.entries()) {
    if (/BOL[AÃ]O CAIXA\s*-\s*SEM TARIFA/.test(line)) { section = 'sem_tarifa'; continue; }
    if (/BOL[AÃ]O CAIXA\s*-\s*COM TARIFA/.test(line)) { section = 'com_tarifa'; continue; }
    if (/^TOTAL\b/.test(line)) {
      const amounts = line.split(/\s+/).filter(x => moneyToken.test(x));
      if (section === 'com_tarifa' && amounts.length >= 2) {
        printedQuota = numberBR(amounts[amounts.length - 2]);
        printedFee = numberBR(amounts[amounts.length - 1]);
      }
      continue;
    }
    const normalized = line.replace(/^(\+?[A-Z][A-Z0-9]*)\s*-\s*(\d{2,6})/, '$1-$2');
    const match = normalized.match(/^(\+?[A-Z][A-Z0-9]*)(?:-([0-9]{2,6}))?\s+(\d{1,3}\s*\/\s*\d{1,3})\s+(.+)$/);
    if (!match || !match[2]) continue;
    const values = match[4].split(/\s+/).filter(x => moneyToken.test(x));
    if (section === 'com_tarifa' && values.length < 3) {
      warnings.push(`Linha ${i + 1} incompleta: ${line}`);
      continue;
    }
    if (section === 'sem_tarifa' && values.length < 1) continue;
    const v = numberBR(values[0]);
    const pct = section === 'com_tarifa' ? numberBR(values[1]) : 0;
    const fee = section === 'com_tarifa' ? numberBR(values[2]) : 0;
    if (![v, pct, fee].every(Number.isFinite)) continue;
    games.push({ concurso: `${match[1]}-${match[2]}`, cotas: match[3].replace(/\s/g, ''), valor_bolao: v, percentual_taxa: pct, valor_taxa: fee, secao: section });
  }
  const compact = [...clean.matchAll(globalRow)].map(m => ({
    concurso: m[1], cotas: m[2].replace(/\s/g, ''),
    valor_bolao: numberBR(m[3]), percentual_taxa: numberBR(m[4]), valor_taxa: numberBR(m[5]),
    secao: 'com_tarifa' as const,
  })).filter(j => [j.valor_bolao, j.percentual_taxa, j.valor_taxa].every(Number.isFinite));
  const chosen = compact.length > games.length ? compact : games;
  const revision = clean.match(/\bREV\s+([\d.\-]+)/);
  const operator = clean.match(/\bOPERADOR\s*:\s*([A-Z0-9]+)/);
  const owner = clean.match(/\bPROPRIETARIO\s*:\s*([^\n]+)/);
  return createExtraction(chosen, {
    data_referencia: parseDate(clean), revisao: revision?.[1] ?? '',
    operador_caixa: operator?.[1] ?? '', proprietario: owner?.[1]?.trim() ?? '',
  }, { cotas: printedQuota, taxas: printedFee }, chosen === compact ? [] : warnings);
}

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

function manualGamesToItems(games: ManualGame[], drawDate: string): BolaoClosingItem[] {
  return games.map(g => ({
    id: g.id, product_id: '', product_name: g.game.trim(), slug: '', shares: 0,
    price_per_share: 0, fee_per_share: 0,
    total: (numberBR(g.value) || 0) + (numberBR(g.tarifa) || 0),
    modality: g.game.trim(), contest: '',
    quantity: '',
    quota_value: numberBR(g.value) || 0, fee_value: numberBR(g.tarifa) || 0,
    draw_date: drawDate, validated: true,
    report_section: 'Cadastro manual', report_kind: 'bolao', source_line: 'Manual',
  } as BolaoClosingItem));
}

function closingToManualGames(closing: FinBolaoClosing): ManualGame[] {
  const items = closing.items ?? [];
  if (!items.length && closing.bolao_game) {
    return [{ id: crypto.randomUUID(), game: closing.bolao_game, value: closing.bolao_value ? String(closing.bolao_value) : '', tarifa: closing.bolao_tarifa ? String(closing.bolao_tarifa) : '' }];
  }
  return items.map(item => ({
    id: item.id ?? crypto.randomUUID(),
    game: item.modality ?? item.product_name ?? '',
    value: item.quota_value != null ? String(item.quota_value) : '',
    tarifa: item.fee_value != null ? String(item.fee_value) : '',
  }));
}

function isManualClosing(c: FinBolaoClosing): boolean {
  if (c.items?.length && c.items.some(i => i.source_line === 'Manual')) return true;
  return !!(c.bolao_game && c.bolao_contest);
}

function operatorPercentageByTotal(total: number): number {
  if (total <= 10000) return 10;
  if (total < 30000) return 20;
  return 30;
}

export function FinancialBolaoClosing() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const canManageAll = isAdmin || profile?.role === 'supervisor';
  const [closings, setClosings] = useState<FinBolaoClosing[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [filterDate, setFilterDate] = useState(today());
  const [viewMode, setViewMode] = useState<'day' | 'month'>('day');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinBolaoClosing | null>(null);
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);
  const [expandedOperator, setExpandedOperator] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
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
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<FinBolaoClosingConfig | null>(null);
  const [configHouse, setConfigHouse] = useState(50);
  const [configOperator, setConfigOperator] = useState(50);
  const [configSaving, setConfigSaving] = useState(false);
  const [tab, setTab] = useState<'manual' | 'json'>('manual');
  const [manualGames, setManualGames] = useState<ManualGame[]>([{ id: crypto.randomUUID(), game: '', value: '', tarifa: '' }]);
  const [caixaTotals, setCaixaTotals] = useState({ total_done: 0, commission: 0, encalhe: 0 });
  const [summaryOperatorId, setSummaryOperatorId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.from('branches').select('*').order('name').then(({ data: rows }) => setBranches((rows ?? []) as Branch[]));
    void supabase.from('products').select('id, name, slug').eq('active', true).order('name').then(({ data: rows }) => setProducts((rows ?? []) as { id: string; name: string; slug: string }[]));
    setSelectedBranch(isAdmin ? '' : profile?.branch_id ?? '');
    void loadConfig();
  }, [isAdmin, profile?.branch_id]);

  const loadConfig = useCallback(async () => {
    const { data: rows } = await supabase.from('fin_bolao_closing_config').select('*').limit(1).maybeSingle();
    if (rows) {
      setConfig(rows as FinBolaoClosingConfig);
      setConfigHouse(Number(rows.house_percentage));
      setConfigOperator(Number(rows.operator_percentage));
    }
  }, []);

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

  const kpiMonth = viewMode === 'month' ? month : filterDate.slice(0, 7);

  useEffect(() => {
    const [year, monthNum] = kpiMonth.split('-').map(Number);
    const nextMonthDate = new Date(year, monthNum, 1);
    const nextMonthStr = nextMonthDate.toLocaleDateString('en-CA');

    let q = supabase.from('fin_caixa_bolao').select('total_done, commission, encalhe')
      .gte('entry_date', `${kpiMonth}-01`)
      .lt('entry_date', nextMonthStr);

    if (!isAdmin) {
      if (!profile?.branch_id) { setCaixaTotals({ total_done: 0, commission: 0, encalhe: 0 }); return; }
      q = q.eq('branch_id', profile.branch_id);
    } else if (selectedBranch) q = q.eq('branch_id', selectedBranch);
    
    void q.then(({ data }) => {
      const rows = (data ?? []) as Pick<FinCaixaBolao, 'total_done' | 'commission' | 'encalhe'>[];
      setCaixaTotals({
        total_done: rows.reduce((s, r) => s + Number(r.total_done ?? 0), 0),
        commission: rows.reduce((s, r) => s + Number(r.commission ?? 0), 0),
        encalhe: rows.reduce((s, r) => s + Number(r.encalhe ?? 0), 0),
      });
    });
  }, [kpiMonth, isAdmin, profile?.branch_id, selectedBranch]);

  const openNew = () => {
    setEditing(null); setClosingDate(filterDate); setDrawDate(filterDate);
    setOperatorId(canManageAll ? '' : profile?.id ?? '');
    setData(null); setJsonText(''); setSourceName(''); setOcrText(''); setNotes('');
    setStatus('open'); setError(''); setMessage('');
    setManualGames([{ id: crypto.randomUUID(), game: '', value: '', tarifa: '' }]);
    setTab('manual');
    setModalOpen(true);
  };
  
  const openEdit = (closing: FinBolaoClosing) => {
    setEditing(closing); setClosingDate(closing.closing_date);
    setDrawDate(closing.items?.[0]?.draw_date ?? closing.closing_date);
    setOperatorId(closing.operator_id); setNotes(closing.notes ?? ''); setStatus(closing.status);
    setSourceName(closing.source_report_name ?? ''); setOcrText(closing.ocr_text ?? '');
    const manual = isManualClosing(closing);
    setManualGames(manual ? closingToManualGames(closing) : [{ id: crypto.randomUUID(), game: '', value: '', tarifa: '' }]);
    setTab(manual ? 'manual' : 'json');
    let restored = storedToJson(closing);
    try {
      const previous = JSON.parse(closing.ocr_text ?? '{}');
      if (previous.extracao?.jogos) restored = parseJsonInput(JSON.stringify(previous.extracao));
    } catch { }
    setData(restored); setJsonText(JSON.stringify(restored, null, 2));
    setError(''); setMessage(''); setModalOpen(true);
  };

  const addGame = () => setManualGames(gs => [...gs, { id: crypto.randomUUID(), game: '', value: '', tarifa: '' }]);
  const removeGame = (id: string) => setManualGames(gs => gs.length > 1 ? gs.filter(g => g.id !== id) : gs);
  const updateGame = (id: string, field: keyof ManualGame, v: string) => setManualGames(gs => gs.map(g => g.id === id ? { ...g, [field]: v } : g));

  const totalValue = useMemo(() => manualGames.reduce((s, g) => s + (numberBR(g.value) || 0), 0), [manualGames]);
  const totalTarifa = useMemo(() => manualGames.reduce((s, g) => s + (numberBR(g.tarifa) || 0), 0), [manualGames]);
  const grossValue = useMemo(() => totalValue + totalTarifa, [totalValue, totalTarifa]);

  const autoOperatorPct = useMemo(() => operatorPercentageByTotal(grossValue), [grossValue]);
  const autoHousePct = useMemo(() => 100 - autoOperatorPct, [autoOperatorPct]);

  const houseAmount = useMemo(() => totalTarifa > 0 ? (totalTarifa * autoHousePct / 100) : 0, [totalTarifa, autoHousePct]);
  const operatorAmount = useMemo(() => totalTarifa > 0 ? (totalTarifa * autoOperatorPct / 100) : 0, [totalTarifa, autoOperatorPct]);

  const saveConfig = async () => {
    if (!isAdmin) return;
    if (configHouse < 0 || configOperator < 0) { setError('Percentuais não podem ser negativos.'); return; }
    setConfigSaving(true);
    const payload = { house_percentage: configHouse, operator_percentage: configOperator, updated_by: profile?.id, updated_at: new Date().toISOString() };
    if (config) {
      await supabase.from('fin_bolao_closing_config').update(payload).eq('id', config.id);
    } else {
      const { data: created } = await supabase.from('fin_bolao_closing_config').insert(payload).select('*').maybeSingle();
      if (created) setConfig(created as FinBolaoClosingConfig);
    }
    setConfigSaving(false);
    setConfigOpen(false);
    await loadConfig();
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
          for (const mode of [6, 11]) {
            await worker.setParameters({ tessedit_pageseg_mode: mode, preserve_interword_spaces: '1' });
            const result = await worker.recognize(image);
            const extracted = parseCaixaText(result.data.text);
            const score = extracted.jogos.length * 100 - extracted.conferencia.avisos.length * 8 -
              extracted.jogos.filter(j => Math.abs(money(j.valor_bolao * j.percentual_taxa / 100) - money(j.valor_taxa)) > 2).length * 25 +
              (extracted.conferencia.total_impresso_cotas !== null && money(extracted.resumo.valor_total_cotas) === money(extracted.conferencia.total_impresso_cotas) ? 500 : 0) +
              (extracted.conferencia.total_impresso_taxas !== null && money(extracted.resumo.valor_total_taxas) === money(extracted.conferencia.total_impresso_taxas) ? 500 : 0) +
              (extracted.conferencia.total_impresso_cotas !== null ? 20 : 0) +
              (extracted.conferencia.total_impresso_taxas !== null ? 20 : 0);
            if (!best || score > best.score) best = { extracted, text: result.data.text, score };
          }
        }
        if (!best) continue;
        const parsed = best.extracted;
        metadata = { ...metadata, data_referencia: parsed.data_referencia, revisao: parsed.revisao || metadata.revisao,
          operador_caixa: parsed.operador_caixa || metadata.operador_caixa, proprietario: parsed.proprietario || metadata.proprietario };
        allGames = allGames.concat(parsed.jogos);
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
      setTab('json');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao ler as fotos.'); }
    finally { if (worker) await worker.terminate(); setBusy(false); }
  };
  
  const issues = useMemo(() => data ? validation(data) : [], [data]);
  const validManualGames = useMemo(() => manualGames.filter(g => g.game.trim() && (numberBR(g.value) || 0) > 0 && (numberBR(g.tarifa) || 0) > 0), [manualGames]);

  const save = async () => {
    if (busy) return;
    if (tab === 'manual') {
      if (!validManualGames.length) { setError('Adicione ao menos um jogo com produto, valor e tarifa.'); return; }
    } else {
      if (!data || issues.length > 0) { setError('Valide o JSON antes de salvar.'); return; }
    }
    const selectedOperator = canManageAll ? operatorId : profile?.id ?? '';
    const operator = operators.find(p => p.id === selectedOperator);
    const branchId = operator?.branch_id ?? (isAdmin ? selectedBranch : profile?.branch_id) ?? '';
    if (!selectedOperator || !branchId) { setError('Selecione um operador vinculado a uma filial.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) { setError('Informe a data do fechamento.'); return; }
    setBusy(true); setError('');
    let payload: Record<string, unknown>;
    if (tab === 'manual') {
      const items = manualGamesToItems(validManualGames, closingDate);
      payload = {
        operator_id: selectedOperator, branch_id: branchId, closing_date: closingDate,
        items: items as unknown as Record<string, unknown>[],
        total_cotas: validManualGames.length, total_value: grossValue, total_fee: totalTarifa,
        pix_externals: editing?.pix_externals ?? [], total_pix_externals: editing?.total_pix_externals ?? 0,
        owed_amounts: editing?.owed_amounts ?? [], total_owed: editing?.total_owed ?? 0,
        notes: notes.trim() || null, status,
        bolao_date: closingDate, bolao_game: null, bolao_contest: null, bolao_value: null, bolao_tarifa: null,
        house_percentage: autoHousePct, operator_percentage: autoOperatorPct,
        house_amount: houseAmount, operator_amount: operatorAmount,
        source_report_name: null, ocr_text: null,
      };
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(drawDate)) { setError('Informe a data do sorteio.'); setBusy(false); return; }
      const parsed = data as Extracao;
      const jsonTotal = parsed.resumo.valor_total_com_taxas;
      const jsonOperatorPct = operatorPercentageByTotal(jsonTotal);
      const jsonHousePct = 100 - jsonOperatorPct;
      const jsonOperatorAmount = parsed.resumo.valor_total_taxas * jsonOperatorPct / 100;
      const jsonHouseAmount = parsed.resumo.valor_total_taxas * jsonHousePct / 100;
      payload = {
        operator_id: selectedOperator, branch_id: branchId, closing_date: closingDate,
        items: toStored(parsed, drawDate) as unknown as Record<string, unknown>[],
        total_cotas: parsed.jogos.reduce((s, j) => s + Number(j.cotas.split('/')[0]), 0),
        total_value: parsed.resumo.valor_total_com_taxas, total_fee: parsed.resumo.valor_total_taxas,
        pix_externals: editing?.pix_externals ?? [], total_pix_externals: editing?.total_pix_externals ?? 0,
        owed_amounts: editing?.owed_amounts ?? [], total_owed: editing?.total_owed ?? 0,
        notes: notes.trim() || null, status, source_report_name: sourceName || null,
        ocr_text: JSON.stringify({ extracao: parsed, texto_original: ocrText }),
        bolao_date: drawDate, bolao_game: '', bolao_contest: '', bolao_value: null, bolao_tarifa: null,
        house_percentage: jsonHousePct, operator_percentage: jsonOperatorPct,
        house_amount: jsonHouseAmount, operator_amount: jsonOperatorAmount,
      };
    }
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
  const totalHouse = visible.reduce((s, c) => s + Number(c.house_amount ?? 0), 0);
  const totalOperator = visible.reduce((s, c) => s + Number(c.operator_amount ?? 0), 0);

  type DayGroup = { date: string; closings: FinBolaoClosing[]; total: number; tarifa: number; house: number; operator: number; games: { game: string; value: number; tarifa: number; drawDate: string }[] };
  type OperatorGroup = { operatorId: string; operator: Profile | null; days: DayGroup[]; valor: number; tarifa: number; gross: number; house: number; operatorAmount: number; count: number };
  type BranchGroup = { branchId: string; branch: Branch | null; operators: OperatorGroup[]; total: number; house: number; operatorAmount: number; count: number };

  const byBranch = useMemo<BranchGroup[]>(() => {
    const branchesMap = new Map<string, BranchGroup>();
    for (const c of visible) {
      let bg = branchesMap.get(c.branch_id);
      if (!bg) { bg = { branchId: c.branch_id, branch: (c.branch as Branch | null) ?? null, operators: [], total: 0, house: 0, operatorAmount: 0, count: 0 }; branchesMap.set(c.branch_id, bg); }
      bg.total += Number(c.total_value ?? 0);
      bg.house += Number(c.house_amount ?? 0);
      bg.operatorAmount += Number(c.operator_amount ?? 0);
      bg.count += 1;
      let og = bg.operators.find(o => o.operatorId === c.operator_id);
      if (!og) { og = { operatorId: c.operator_id, operator: (c.operator as Profile | null) ?? null, days: [], valor: 0, tarifa: 0, gross: 0, house: 0, operatorAmount: 0, count: 0 }; bg.operators.push(og); }
      
      // Cálculo para o cabeçalho do operador
      let opValor = 0;
      let opTarifa = 0;
      if (isManualClosing(c)) {
        const mg = closingToManualGames(c);
        opValor = mg.reduce((s, g) => s + (numberBR(g.value) || 0), 0);
        opTarifa = mg.reduce((s, g) => s + (numberBR(g.tarifa) || 0), 0);
      } else {
        opValor = (c.items ?? []).reduce((s, item) => s + Number(item.quota_value ?? 0), 0);
        opTarifa = (c.items ?? []).reduce((s, item) => s + Number(item.fee_value ?? 0), 0);
      }

      og.valor += opValor;
      og.tarifa += opTarifa;
      og.gross += (opValor + opTarifa);
      og.house += Number(c.house_amount ?? 0);
      og.operatorAmount += Number(c.operator_amount ?? 0);
      og.count += 1;
      
      let dg = og.days.find(d => d.date === c.closing_date);
      if (!dg) { dg = { date: c.closing_date, closings: [], total: 0, tarifa: 0, house: 0, operator: 0, games: [] }; og.days.push(dg); }
      dg.closings.push(c);
      dg.total += Number(c.total_value ?? 0);
      dg.tarifa += Number(c.total_fee ?? 0);
      dg.house += Number(c.house_amount ?? 0);
      dg.operator += Number(c.operator_amount ?? 0);
      if (isManualClosing(c)) dg.games.push(...closingToManualGames(c).map(g => ({ game: g.game, value: numberBR(g.value) || 0, tarifa: numberBR(g.tarifa) || 0, drawDate: c.bolao_date ?? c.closing_date })));
      else dg.games.push(...(c.items ?? []).map(item => ({ game: item.modality ?? item.product_name ?? '', value: Number(item.quota_value ?? 0), tarifa: Number(item.fee_value ?? 0), drawDate: item.draw_date ?? c.closing_date })));
    }
    for (const bg of branchesMap.values()) {
      bg.operators.sort((a, b) => (a.operator?.name ?? '').localeCompare(b.operator?.name ?? ''));
      for (const og of bg.operators) og.days.sort((a, b) => b.date.localeCompare(a.date));
    }
    return Array.from(branchesMap.values()).sort((a, b) => (a.branch?.name ?? '').localeCompare(b.branch?.name ?? ''));
  }, [visible]);

  const multiBranch = isAdmin && !selectedBranch;

  const monthSummary = useMemo(() => {
    if (!summaryOperatorId) return null;
    
    const op = operators.find(p => p.id === summaryOperatorId)
      ?? (closings.find(c => c.operator_id === summaryOperatorId)?.operator as Profile | undefined) ?? null;
    
    const list = closings.filter(c => c.operator_id === summaryOperatorId && c.closing_date.startsWith(kpiMonth));
    
    const sum = { valor: 0, tarifa: 0, gross: 0, house: 0, operatorAmount: 0, count: list.length };
    const days = new Set<string>();
    
    for (const c of list) {
      let cValor = 0;
      let cTarifa = 0;
      if (isManualClosing(c)) {
        const mg = closingToManualGames(c);
        cValor = mg.reduce((s, g) => s + (numberBR(g.value) || 0), 0);
        cTarifa = mg.reduce((s, g) => s + (numberBR(g.tarifa) || 0), 0);
      } else {
        cValor = (c.items ?? []).reduce((s, item) => s + Number(item.quota_value ?? 0), 0);
        cTarifa = (c.items ?? []).reduce((s, item) => s + Number(item.fee_value ?? 0), 0);
      }
      
      sum.valor += cValor;
      sum.tarifa += cTarifa;
      sum.gross += (cValor + cTarifa);
      sum.house += Number(c.house_amount ?? 0);
      sum.operatorAmount += Number(c.operator_amount ?? 0);
      days.add(c.closing_date);
    }

    const gross = sum.gross;
    const pct = operatorPercentageByTotal(gross);
    
    // A comissão É RECALCULADA com base na tarifa total do mês e na faixa do bruto.
    // O valor salvo no banco pode ter sido calculado por lançamento, mas aqui mostramos a regra exata consolidada.
    const calculatedCommission = sum.tarifa * (pct / 100);
    
    const nextTier = gross <= 10000 ? 10000 : gross < 30000 ? 30000 : null;
    const prevTier = gross < 30000 ? (gross <= 10000 ? 0 : 10000) : 30000;
    
    let progress = 100;
    if (nextTier) {
      const stepSize = nextTier - prevTier;
      const currentInStep = gross - prevTier;
      progress = Math.min(100, (currentInStep / stepSize) * 100);
    }

    const missingForNext = nextTier ? nextTier - gross : 0;

    return { op, list, days: Array.from(days).sort((a, b) => b.localeCompare(a)), ...sum, pct, progress, nextTier, missingForNext, calculatedCommission };
  }, [summaryOperatorId, closings, operators, kpiMonth]);

  if (loading && !closings.length) return <div className="flex justify-center py-20"><Spinner /></div>;
  
  return <div>
    <PageHeader title="Fechamento de Bolão" subtitle="Cadastro de bolões por operador com vários jogos por dia e comissão automática sobre a tarifa"
      action={<div className="flex flex-wrap gap-2 items-center">
        {isAdmin && <Select value={selectedBranch} onChange={setSelectedBranch} options={[{ value: '', label: 'Todas as filiais' }, ...branches.map(b => ({ value: b.id, label: b.name }))]} />}
        <Select value={viewMode} onChange={v => setViewMode(v as 'day' | 'month')} options={[{ value: 'day', label: 'Dia' }, { value: 'month', label: 'Mês' }]} />
        {viewMode === 'day' ? <Input type="date" value={filterDate} onChange={setFilterDate} /> : <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-lg border p-2" />}
        <Button onClick={openNew}><Camera size={17} /> Novo fechamento</Button>
      </div>} />
      
    {error && !modalOpen && !configOpen && <p className="p-3 bg-red-50 text-red-700 rounded-lg mb-4">{error}</p>}
    
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
      <Card className="p-4"><p>Fechamentos</p><strong>{visible.length}</strong></Card>
      <Card className="p-4"><p>Total geral</p><strong>R$ {formatBRL(total)}</strong></Card>
      <Card className="p-4"><p>Parte da casa</p><strong className="text-brand-700">R$ {formatBRL(totalHouse)}</strong></Card>
      <Card className="p-4"><p>Parte do operador</p><strong className="text-accent-700">R$ {formatBRL(totalOperator)}</strong></Card>
    </div>
    
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
      <Card className="p-4 border-l-4 border-l-brand-500">
        <p className="text-xs text-slate-400 uppercase tracking-wide">Caixa Bolão · Total feito</p>
        <strong className="text-lg text-brand-700">R$ {formatBRL(caixaTotals.total_done)}</strong>
      </Card>
      <Card className="p-4 border-l-4 border-l-accent-500">
        <p className="text-xs text-slate-400 uppercase tracking-wide">Caixa Bolão · Total Comissão</p>
        <strong className="text-lg text-accent-700">R$ {formatBRL(caixaTotals.commission)}</strong>
      </Card>
      <Card className="p-4 border-l-4 border-l-red-500">
        <p className="text-xs text-slate-400 uppercase tracking-wide">Caixa Bolão · Total Encalhe</p>
        <strong className="text-lg text-red-600">R$ {formatBRL(caixaTotals.encalhe)}</strong>
      </Card>
    </div>
    
    {!byBranch.length ? <Card><EmptyState icon={<FileJson size={42} />} title="Nenhum fechamento" description="Cadastre um bolão manualmente ou envie o comprovante." /> </Card> :
      <div className="space-y-4">{byBranch.map(bg => {
        const branchKey = bg.branchId;
        const branchOpen = expandedBranch === branchKey;
        const renderOperators = () => bg.operators.map(og => {
          const opKey = `${branchKey}__${og.operatorId}`;
          const opOpen = expandedOperator === opKey;
          const allClosed = og.days.every(d => d.closings.every(c => c.status === 'closed'));
          return <Card key={opKey} className="overflow-hidden">
            <button className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors" onClick={() => setExpandedOperator(opOpen ? null : opKey)}>
              <span className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><User size={20} /></span>
                <span>
                  <strong className="flex items-center gap-2 flex-wrap">
                    <button type="button" className="underline-offset-2 hover:underline hover:text-brand-700 transition-colors"
                      onClick={e => { e.stopPropagation(); setSummaryOperatorId(og.operatorId); }}>
                      {og.operator?.name ?? 'Operador'}
                    </button>
                    <Badge color={allClosed ? 'blue' : 'amber'}>{allClosed ? 'Fechado' : 'Aberto'}</Badge>
                  </strong>
                  <span className="text-xs text-slate-500 flex flex-wrap items-center gap-3 mt-1">
                    <span className="font-medium">Valor: R$ {formatBRL(og.valor)}</span>
                    <span className="font-medium">Tarifa: R$ {formatBRL(og.tarifa)}</span>
                    <span className="font-semibold text-slate-700">Faturamento Bruto: R$ {formatBRL(og.gross)}</span>
                    <span className="text-brand-600 font-medium">Casa: R$ {formatBRL(og.house)}</span>
                    <span className="text-accent-600 font-medium">Comissão: R$ {formatBRL(og.operatorAmount)}</span>
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge color="slate">{og.days.length} dia(s)</Badge>
                {opOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
              </span>
            </button>
            {opOpen && <div className="border-t border-slate-100 p-4 space-y-2">
              {og.days.map(dg => {
                const dayKey = `${opKey}__${dg.date}`;
                const dayOpen = expandedDay === dayKey;
                const dayAllClosed = dg.closings.every(c => c.status === 'closed');
                return <div key={dayKey} className={`rounded-lg border ${dayAllClosed ? 'bg-slate-50 border-slate-200' : 'bg-amber-50 border-amber-200'}`}>
                  <button className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-100 transition-colors rounded-lg" onClick={() => setExpandedDay(dayOpen ? null : dayKey)}>
                    <span className="flex items-center gap-3">
                      {dayAllClosed ? <Badge color="blue"><Lock size={12} className="mr-1" /> Fechado</Badge> : <Badge color="amber"><Unlock size={12} className="mr-1" /> Aberto</Badge>}
                      <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5"><Calendar size={14} /> {formatDateBR(dg.date)}</span>
                      <Badge color="slate">{dg.games.length} jogo(s)</Badge>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">R$ {formatBRL(dg.total)}</span>
                      {dayOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                    </span>
                  </button>
                  {dayOpen && <div className="px-3 pb-3 space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-100">
                            <th className="px-2 py-2 font-medium">Jogo</th>
                            <th className="px-2 py-2 font-medium text-right">Valor</th>
                            <th className="px-2 py-2 font-medium text-right">Tarifa</th>
                            <th className="px-2 py-2 font-medium text-right">Bruto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dg.games.map((g, i) => (
                            <tr key={i} className="border-b border-slate-50">
                              <td className="px-2 py-2 font-medium text-slate-900">{g.game || '—'}</td>
                              <td className="px-2 py-2 text-right">R$ {formatBRL(g.value)}</td>
                              <td className="px-2 py-2 text-right">R$ {formatBRL(g.tarifa)}</td>
                              <td className="px-2 py-2 text-right font-medium">R$ {formatBRL(g.value + g.tarifa)}</td>
                            </tr>
                          ))}
                          <tr className="bg-slate-100/60 font-semibold">
                            <td className="px-2 py-2">Total do dia</td>
                            <td className="px-2 py-2 text-right">R$ {formatBRL(dg.games.reduce((s, g) => s + g.value, 0))}</td>
                            <td className="px-2 py-2 text-right">R$ {formatBRL(dg.tarifa)}</td>
                            <td className="px-2 py-2 text-right">R$ {formatBRL(dg.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-brand-50 rounded-lg p-3 flex justify-between items-center"><span className="text-sm text-brand-600">Casa <span className="text-xs">(% da tarifa)</span></span><strong className="text-brand-700">R$ {formatBRL(dg.house)}</strong></div>
                      <div className="bg-accent-50 rounded-lg p-3 flex justify-between items-center"><span className="text-sm text-accent-600">Operador <span className="text-xs">(% da tarifa)</span></span><strong className="text-accent-700">R$ {formatBRL(dg.operator)}</strong></div>
                    </div>
                    {dg.closings.map(c => <div key={c.id} className="flex items-center justify-between border-t border-slate-200 pt-3">
                      <span className="text-xs text-slate-400">
                        {isManualClosing(c) ? <Badge color="green">Manual</Badge> : <Badge color="slate">Comprovante</Badge>}
                        {' '}R$ {formatBRL(Number(c.total_value ?? 0))}
                        {c.operator_percentage != null && <span className="ml-2">· Oper. {Number(c.operator_percentage)}%</span>}
                      </span>
                      {(isAdmin || (profile?.role === 'supervisor' && c.branch_id === profile?.branch_id) || c.operator_id === profile?.id) && <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(c)}>Editar</Button>
                        <Button size="sm" variant="secondary" onClick={() => void toggle(c)}>{c.status === 'closed' ? <Unlock size={14} /> : <Lock size={14} />}{c.status === 'closed' ? 'Reabrir' : 'Fechar'}</Button>
                        <Button size="sm" variant="danger" onClick={() => void remove(c)}><Trash2 size={14} /> Excluir</Button>
                      </div>}
                    </div>)}
                  </div>}
                </div>;
              })}
            </div>}
          </Card>;
        });

        if (multiBranch) {
          return <Card key={branchKey} className="overflow-hidden">
            <button className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors" onClick={() => setExpandedBranch(branchOpen ? null : branchKey)}>
              <span className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"><Building2 size={20} /></span>
                <span>
                  <strong>{bg.branch?.name ?? 'Sem filial'}</strong>
                  <span className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
                    <span className="text-slate-700 font-semibold">Total: R$ {formatBRL(bg.total)}</span>
                    <span className="text-brand-600">Casa: R$ {formatBRL(bg.house)}</span>
                    <span className="text-accent-600">Operador: R$ {formatBRL(bg.operatorAmount)}</span>
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge color="slate">{bg.operators.length} operador(es)</Badge>
                {branchOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
              </span>
            </button>
            {branchOpen && <div className="border-t border-slate-100 p-4 space-y-3">{renderOperators()}</div>}
          </Card>;
        }
        return <div key={branchKey} className="space-y-3">{renderOperators()}</div>;
      })}</div>}

    <Modal open={modalOpen} onClose={() => !busy && setModalOpen(false)} title={editing ? 'Editar fechamento' : 'Novo fechamento'} maxWidth="max-w-4xl">
      <div className="space-y-4">
        <div className="flex gap-2 border-b border-slate-200">
          <button className={`px-4 py-2 text-sm font-medium ${tab === 'manual' ? 'text-brand-700 border-b-2 border-brand-600' : 'text-slate-500'}`} onClick={() => setTab('manual')}>Cadastro manual</button>
          <button className={`px-4 py-2 text-sm font-medium ${tab === 'json' ? 'text-brand-700 border-b-2 border-brand-600' : 'text-slate-500'}`} onClick={() => setTab('json')}>Comprovante / JSON</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Data do fechamento" type="date" value={closingDate} onChange={setClosingDate} />
          {tab === 'json' && <Input label="Data do sorteio (todos os jogos)" type="date" value={drawDate} onChange={setDrawDate} />}
          {canManageAll ? <Select label="Operador" value={operatorId} onChange={setOperatorId} options={operators.map(o => ({ value: o.id, label: o.name }))} placeholder="Selecione o operador" /> : <p className="text-sm"><span className="block text-sm font-medium text-slate-700 mb-1.5">Operador</span>{profile?.name}</p>}
        </div>

        {tab === 'manual' ? <div className="space-y-4">
          <div className="space-y-2">
            {manualGames.map((g, idx) => <div key={g.id} className="rounded-lg border border-slate-200 p-3 space-y-3 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Jogo {idx + 1}</span>
                {manualGames.length > 1 && <button onClick={() => removeGame(g.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>}
              </div>
              <Select label="Jogo / Produto" value={products.find(p => p.name === g.game)?.id ?? ''} onChange={v => { const p = products.find(x => x.id === v); updateGame(g.id, 'game', p?.name ?? ''); }} options={products.map(p => ({ value: p.id, label: p.name }))} placeholder="Selecione o jogo" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Valor (R$)" type="number" step="0.01" value={g.value} onChange={v => updateGame(g.id, 'value', v)} placeholder="0,00" min={0} />
                <Input label="Tarifa (R$)" type="number" step="0.01" value={g.tarifa} onChange={v => updateGame(g.id, 'tarifa', v)} placeholder="0,00" min={0} />
              </div>
            </div>)}
          </div>
          <Button variant="secondary" onClick={addGame}><Plus size={16} /> Adicionar jogo</Button>
          {validManualGames.length > 0 && totalTarifa > 0 && <div className="rounded-lg border border-slate-200 p-4 space-y-2 bg-slate-50">
            <div className="flex justify-between text-sm"><span className="text-slate-600">Valor bruto (valor + tarifa de {validManualGames.length} jogo{validManualGames.length > 1 ? 's' : ''})</span><strong>R$ {formatBRL(grossValue)}</strong></div>
            <div className="flex justify-between text-sm"><span className="text-slate-600">Soma das tarifas</span><strong>R$ {formatBRL(totalTarifa)}</strong></div>
            <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
              <span className="text-brand-600">Casa ({autoHousePct}% da tarifa)</span>
              <strong className="text-brand-700">R$ {formatBRL(houseAmount)}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-accent-600">Operador ({autoOperatorPct}% da tarifa)</span>
              <strong className="text-accent-700">R$ {formatBRL(operatorAmount)}</strong>
            </div>
            <p className="text-xs text-slate-500">Faixa aplicada automaticamente pela soma: até R$ 10.000,00 = 10% · R$ 10.000,01 a R$ 29.999,99 = 20% · R$ 30.000,00+ = 30%</p>
          </div>}
        </div> : <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <label className="cursor-pointer rounded-lg bg-blue-700 text-white px-4 py-2 text-sm flex gap-2 items-center"><Upload size={16} /> {busy ? 'Lendo...' : 'Fotografar / enviar comprovante'}
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={busy} onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) void runOcr(f); e.target.value = ''; }} />
            </label>
            <label className="cursor-pointer rounded-lg border px-4 py-2 text-sm">Importar arquivo .json
              <input type="file" accept=".json,application/json" className="sr-only" disabled={busy} onChange={async e => { const f = e.target.files?.[0]; if (f) { setJsonText(await f.text()); setData(null); setMessage('Clique em Validar JSON.'); } e.target.value = ''; }} />
            </label>
          </div>
          <p className="text-sm text-slate-600">O OCR gera JSON a partir do padrão <strong>RESUMO DE BOLÃO</strong>. Revise o JSON antes de salvar; fotografias podem conter erros de reconhecimento.</p>
          <label className="block text-sm font-medium">JSON extraído / editável
            <textarea className="mt-2 w-full min-h-72 rounded-lg border border-slate-300 p-3 font-mono text-xs" spellCheck={false} value={jsonText} onChange={e => { setJsonText(e.target.value); setData(null); setMessage('JSON alterado: valide novamente.'); }} placeholder='{"data_referencia":"2026-10-21","jogos":[...],"resumo":{...}}' />
          </label>
          <Button variant="secondary" onClick={importJson} disabled={busy}><FileJson size={16} /> Validar JSON</Button>
          {message && <p className="text-sm text-slate-600">{message}</p>}
          {data && <div className="rounded-lg border p-4 space-y-2">
            <p><strong>{data.resumo.quantidade_boloes} bolões</strong> · Cotas: <strong>R$ {formatBRL(data.resumo.valor_total_cotas)}</strong> · Taxas: <strong>R$ {formatBRL(data.resumo.valor_total_taxas)}</strong> · Total: <strong>R$ {formatBRL(data.resumo.valor_total_com_taxas)}</strong></p>
            <p className="text-xs">Impresso no comprovante — cotas: {data.conferencia.total_impresso_cotas === null ? 'não encontrado' : `R$ ${formatBRL(data.conferencia.total_impresso_cotas)}`} · taxas: {data.conferencia.total_impresso_taxas === null ? 'não encontrado' : `R$ ${formatBRL(data.conferencia.total_impresso_taxas)}`}</p>
            {(() => {
              const total = data.resumo.valor_total_com_taxas;
              const opPct = operatorPercentageByTotal(total);
              const housePct = 100 - opPct;
              const opAmount = data.resumo.valor_total_taxas * opPct / 100;
              const houseAmount = data.resumo.valor_total_taxas * housePct / 100;
              return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="bg-brand-50 rounded-lg p-3 flex justify-between items-center"><span className="text-sm text-brand-600">Casa ({housePct}% da tarifa)</span><strong className="text-brand-700">R$ {formatBRL(houseAmount)}</strong></div>
                <div className="bg-accent-50 rounded-lg p-3 flex justify-between items-center"><span className="text-sm text-accent-600">Operador ({opPct}% da tarifa)</span><strong className="text-accent-700">R$ {formatBRL(opAmount)}</strong></div>
              </div>;
            })()}
            {issues.length ? <div className="text-sm text-red-700"><strong>Conferência pendente:</strong><ul className="list-disc pl-5">{issues.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : <p className="text-sm text-green-700 font-semibold">Totais conferidos. JSON pronto para fechamento.</p>}
          </div>}
        </div>}

        <Input label="Observações" value={notes} onChange={setNotes} />
        <Select label="Status" value={status} onChange={v => setStatus(v as 'open' | 'closed')} options={[{ value: 'open', label: 'Aberto' }, { value: 'closed', label: 'Fechado' }]} />
        {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancelar</Button><Button onClick={() => void save()} disabled={busy || (tab === 'json' && (!data || issues.length > 0))}>{busy ? 'Processando...' : 'Salvar fechamento'}</Button></div>
      </div>
    </Modal>

    <Modal open={!!summaryOperatorId} onClose={() => setSummaryOperatorId(null)} title={`Resumo do mês — ${monthSummary?.op?.name ?? 'Operador'}`} maxWidth="max-w-2xl">
      {monthSummary && <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3"><p className="text-xs text-slate-400">Fechamentos</p><strong>{monthSummary.count}</strong></Card>
          <Card className="p-3"><p className="text-xs text-slate-400">Dias com fechamento</p><strong>{monthSummary.days.length}</strong></Card>
          <Card className="p-3"><p className="text-xs text-slate-400">Faturamento Bruto</p><strong>R$ {formatBRL(monthSummary.gross)}</strong></Card>
          <Card className="p-3"><p className="text-xs text-slate-400">Tarifas</p><strong>R$ {formatBRL(monthSummary.tarifa)}</strong></Card>
          <Card className="p-3"><p className="text-xs text-slate-400">Casa</p><strong className="text-brand-700">R$ {formatBRL(monthSummary.house)}</strong></Card>
          <Card className="p-3"><p className="text-xs text-slate-400">Comissão do operador</p><strong className="text-accent-700">R$ {formatBRL(monthSummary.operatorAmount)}</strong></Card>
          <Card className="p-3"><p className="text-xs text-slate-400">Faixa de comissão</p><strong className="text-accent-700">{monthSummary.pct}%</strong></Card>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-slate-700">Progresso da comissão ({monthSummary.pct}% da tarifa)</span>
            {monthSummary.nextTier
              ? <span className="text-xs text-slate-400">Faltam R$ {formatBRL(monthSummary.missingForNext)} para {monthSummary.nextTier >= 30000 ? '30%' : '20%'}</span>
              : <Badge color="green">Faixa máxima atingida</Badge>}
          </div>
          
          <div className="relative pt-1">
            <div className="flex mb-2 items-center justify-between">
              <div>
                <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-brand-600 bg-brand-200">
                  R$ {formatBRL(monthSummary.gross)} Faturados
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold inline-block text-brand-600">
                  {monthSummary.progress.toFixed(0)}% da faixa atual
                </span>
              </div>
            </div>
            <div className="overflow-hidden h-4 mb-4 text-xs flex rounded bg-slate-200">
              <div style={{ width: `${monthSummary.progress}%` }} className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all ${monthSummary.pct >= 30 ? 'bg-emerald-500' : monthSummary.pct >= 20 ? 'bg-accent-500' : 'bg-brand-500'}`}></div>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>R$ 0</span>
              <span className={monthSummary.gross >= 10000 ? 'font-bold text-accent-600' : ''}>R$ 10k (20%)</span>
              <span className={monthSummary.gross >= 30000 ? 'font-bold text-emerald-600' : ''}>R$ 30k (30%)</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">Regra: Até R$ 10.000 = 10% · De R$ 10.000,01 a R$ 29.999,99 = 20% · A partir de R$ 30.000 = 30%</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="px-2 py-2 font-medium">Data</th>
                <th className="px-2 py-2 font-medium text-right">Valor</th>
                <th className="px-2 py-2 font-medium text-right">Tarifa</th>
                <th className="px-2 py-2 font-medium text-right">Bruto</th>
                <th className="px-2 py-2 font-medium text-right">Casa</th>
                <th className="px-2 py-2 font-medium text-right">Comissão</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {monthSummary.list.sort((a, b) => b.closing_date.localeCompare(a.closing_date)).map(c => {
                let cValor = 0;
                let cTarifa = 0;
                if (isManualClosing(c)) {
                  const mg = closingToManualGames(c);
                  cValor = mg.reduce((s, g) => s + (numberBR(g.value) || 0), 0);
                  cTarifa = mg.reduce((s, g) => s + (numberBR(g.tarifa) || 0), 0);
                } else {
                  cValor = (c.items ?? []).reduce((s, item) => s + Number(item.quota_value ?? 0), 0);
                  cTarifa = (c.items ?? []).reduce((s, item) => s + Number(item.fee_value ?? 0), 0);
                }
                return <tr key={c.id} className="border-b border-slate-50">
                  <td className="px-2 py-2">{formatDateBR(c.closing_date)}</td>
                  <td className="px-2 py-2 text-right">R$ {formatBRL(cValor)}</td>
                  <td className="px-2 py-2 text-right">R$ {formatBRL(cTarifa)}</td>
                  <td className="px-2 py-2 text-right font-medium">R$ {formatBRL(cValor + cTarifa)}</td>
                  <td className="px-2 py-2 text-right text-brand-700">R$ {formatBRL(Number(c.house_amount ?? 0))}</td>
                  <td className="px-2 py-2 text-right text-accent-700">R$ {formatBRL(Number(c.operator_amount ?? 0))}</td>
                  <td className="px-2 py-2"><Badge color={c.status === 'closed' ? 'blue' : 'amber'}>{c.status === 'closed' ? 'Fechado' : 'Aberto'}</Badge></td>
                </tr>;
              })}
              <tr className="bg-slate-100/60 font-semibold">
                <td className="px-2 py-2">Total do mês</td>
                <td className="px-2 py-2 text-right">R$ {formatBRL(monthSummary.valor)}</td>
                <td className="px-2 py-2 text-right">R$ {formatBRL(monthSummary.tarifa)}</td>
                <td className="px-2 py-2 text-right">R$ {formatBRL(monthSummary.gross)}</td>
                <td className="px-2 py-2 text-right">R$ {formatBRL(monthSummary.house)}</td>
                <td className="px-2 py-2 text-right">R$ {formatBRL(monthSummary.operatorAmount)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>}
    </Modal>
  </div>;
}
