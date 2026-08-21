import { useEffect, useState, useCallback } from 'react';
import { Ticket, Plus, Calendar, Clock, Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Spinner, EmptyState, Badge, Modal } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import { STATUS_LABELS } from '../lib/bolaoKpis';
import { formatBRL } from '../lib/format';
import type { Product, Bolao } from '../lib/types';

const DEFAULT_DRAW_TIME = '20:00';
const DAY_PAGE_SIZE = 7;

interface DayGroup { key: string; label: string; boloes: Bolao[]; }

function groupByDay(boloes: Bolao[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const b of boloes) {
    const d = new Date(b.created_at + 'Z');
    const key = d.toISOString().split('T')[0];
    if (!map.has(key)) {
      const label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      map.set(key, { key, label: label.charAt(0).toUpperCase() + label.slice(1), boloes: [] });
    }
    map.get(key)!.boloes.push(b);
  }
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

export function AdminCreateBolao() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [productId, setProductId] = useState('');
  const [contestNumber, setContestNumber] = useState('');
  const [dezenas, setDezenas] = useState(6);
  const [jogos, setJogos] = useState(1);
  const [price, setPrice] = useState(0);
  const [serviceFee, setServiceFee] = useState(0);
  const [drawDate, setDrawDate] = useState('');
  const [drawTime, setDrawTime] = useState(DEFAULT_DRAW_TIME);
  const [totalShares, setTotalShares] = useState(1);
  const [notes, setNotes] = useState('');

  const [recentBoloes, setRecentBoloes] = useState<Bolao[]>([]);
  const [dayPage, setDayPage] = useState(0);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);

  const [editing, setEditing] = useState<Bolao | null>(null);
  const [editContestNumber, setEditContestNumber] = useState('');
  const [editDezenas, setEditDezenas] = useState(6);
  const [editJogos, setEditJogos] = useState(1);
  const [editPrice, setEditPrice] = useState(0);
  const [editFee, setEditFee] = useState(0);
  const [editDrawDate, setEditDrawDate] = useState('');
  const [editDrawTime, setEditDrawTime] = useState(DEFAULT_DRAW_TIME);
  const [editTotalShares, setEditTotalShares] = useState(1);
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase.from('products').select('*').eq('active', true).order('name');
    const list = (data ?? []) as Product[];
    setProducts(list);
    if (list.length > 0) {
      const first = list[0];
      setProductId(first.id);
      setDezenas(first.min_dezenas);
      setPrice(Number(first.base_price));
      setServiceFee(Number(first.service_fee));
      setDrawTime(first.default_draw_time?.slice(0, 5) ?? DEFAULT_DRAW_TIME);
    }
    setLoading(false);
  }, []);

  const fetchRecentBoloes = useCallback(async () => {
    const { data } = await supabase
      .from('boloes')
      .select('*, product:products(*)')
      .order('created_at', { ascending: false });
    setRecentBoloes((data ?? []) as Bolao[]);
  }, []);

  useEffect(() => { fetchProducts(); fetchRecentBoloes(); }, [fetchProducts, fetchRecentBoloes]);

  const selectedProduct = products.find((p) => p.id === productId);

  const onProductChange = (id: string) => {
    setProductId(id);
    const p = products.find((p) => p.id === id);
    if (p) {
      setDezenas(p.min_dezenas);
      setPrice(Number(p.base_price));
      setServiceFee(Number(p.service_fee));
      setDrawTime(p.default_draw_time?.slice(0, 5) ?? DEFAULT_DRAW_TIME);
    }
  };

  const openEdit = (b: Bolao) => {
    setEditing(b);
    setEditContestNumber(b.contest_number);
    setEditDezenas(b.dezenas);
    setEditJogos(b.jogos);
    setEditPrice(Number(b.price));
    setEditFee(Number(b.service_fee));
    setEditDrawDate(b.draw_date);
    setEditDrawTime(b.draw_time?.slice(0, 5) ?? DEFAULT_DRAW_TIME);
    setEditTotalShares(b.total_shares);
    setEditNotes(b.notes ?? '');
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setEditSaving(true);
    setEditError(null);
    const { error: updateError } = await supabase.from('boloes').update({
      contest_number: editContestNumber.trim(),
      dezenas: Number(editDezenas),
      jogos: Number(editJogos),
      price: Number(editPrice),
      service_fee: Number(editFee),
      draw_date: editDrawDate,
      draw_time: `${editDrawTime}:00`,
      total_shares: Number(editTotalShares),
      notes: editNotes.trim() || null,
    }).eq('id', editing.id);
    setEditSaving(false);
    if (updateError) {
      setEditError(updateError.message);
      return;
    }
    setEditing(null);
    fetchRecentBoloes();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!productId) { setError('Selecione um produto.'); return; }
    if (!contestNumber.trim()) { setError('Informe o número do concurso.'); return; }
    if (!drawDate) { setError('Informe a data do sorteio.'); return; }
    if (!drawTime) { setError('Informe o horário do sorteio.'); return; }

    const product = selectedProduct;
    if (product && (dezenas < product.min_dezenas || dezenas > product.max_dezenas)) {
      setError(`Dezenas deve estar entre ${product.min_dezenas} e ${product.max_dezenas} para ${product.name}.`);
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase.from('boloes').insert({
      branch_id: null,
      product_id: productId,
      operator_id: null,
      contest_number: contestNumber.trim(),
      dezenas: Number(dezenas),
      jogos: Number(jogos),
      price: Number(price),
      service_fee: Number(serviceFee),
      draw_date: drawDate,
      draw_time: `${drawTime}:00`,
      total_shares: Number(totalShares),
      sold_shares: 0,
      status: 'pending',
      notes: notes.trim() || null,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setContestNumber('');
    setNotes('');
    setTotalShares(1);
    setJogos(1);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    fetchRecentBoloes();
  };

  return (
    <div>
      <PageHeader title="Criar Bolão" subtitle="Crie bolões centralizados para o grupo Mega Bolão Brasil — a distribuição de cotas é feita depois, em Alocação de Bolões" />

      {success && (
        <div className="mb-4 bg-brand-50 border border-brand-200 rounded-lg p-4 flex items-center gap-2 text-brand-700">
          <Ticket size={20} />
          <span className="font-medium">Bolão criado com sucesso! Vá em "Alocação de Bolões" para distribuir as cotas entre os operadores.</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>
      ) : products.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Ticket size={48} />}
            title="Nenhum produto ativo"
            description="Cadastre produtos na aba 'Produtos' antes de criar bolões."
          />
        </Card>
      ) : (
        <Card className="p-6 max-w-2xl mb-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Select
              label="Produto *"
              value={productId}
              onChange={onProductChange}
              options={products.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Selecione um produto"
              required
            />

            {selectedProduct && (
              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 flex flex-wrap items-center gap-4">
                <LotteryIcon slug={selectedProduct.slug} size={28} />
                <span>Dezenas: {selectedProduct.min_dezenas} a {selectedProduct.max_dezenas}</span>
                <span>Sorteio: {selectedProduct.draw_frequency ?? '—'}</span>
                <span>Horário padrão: {selectedProduct.default_draw_time?.slice(0, 5) ?? '—'}</span>
                <span>Preço base: R$ {formatBRL(Number(selectedProduct.base_price))}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Número do concurso *" value={contestNumber} onChange={setContestNumber} placeholder="Ex: 2500" required />
              <Input label="Total de cotas *" type="number" value={totalShares} onChange={(v) => setTotalShares(Number(v))} min={1} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Data do sorteio *" type="date" value={drawDate} onChange={setDrawDate} required />
              <Input label="Horário do sorteio *" type="time" value={drawTime} onChange={setDrawTime} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Quantidade de dezenas *"
                type="number"
                value={dezenas}
                onChange={(v) => setDezenas(Number(v))}
                min={selectedProduct?.min_dezenas?.toString() ?? '1'}
                max={selectedProduct?.max_dezenas?.toString() ?? '100'}
                required
              />
              <Input label="Quantidade de jogos *" type="number" value={jogos} onChange={(v) => setJogos(Number(v))} min={1} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Preço da cota (R$) *" type="number" step="0.01" value={price} onChange={(v) => setPrice(Number(v))} min={0} required />
              <Input label="Taxa de serviço por cota (R$) *" type="number" step="0.01" value={serviceFee} onChange={(v) => setServiceFee(Number(v))} min={0} required />
            </div>

            <div className="bg-brand-50 rounded-lg p-3 text-xs text-brand-700 flex flex-wrap gap-x-6 gap-y-1">
              <span>Valor da cota: <strong>R$ {formatBRL(Number(price) + Number(serviceFee))}</strong></span>
              <span>Taxa total ({totalShares} cotas): <strong>R$ {formatBRL(Number(serviceFee) * totalShares)}</strong></span>
              <span>Comissão base (30%): <strong>R$ {formatBRL(Number(serviceFee) * totalShares * 0.3)}</strong></span>
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Observações</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Informações adicionais sobre o bolão..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
              />
            </label>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="text-sm text-slate-500">
                Total do bolão ({totalShares} cotas): <span className="font-bold text-slate-900">R$ {formatBRL((Number(price) + Number(serviceFee)) * totalShares)}</span>
              </div>
              <Button type="submit" size="lg" disabled={saving}>
                <Plus size={18} /> {saving ? 'Criando...' : 'Criar Bolão'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold text-brand-950 mb-4 flex items-center gap-2">
          <Calendar size={20} /> Bolões Criados por Dia
        </h2>
        {recentBoloes.length === 0 ? (
          <Card>
            <EmptyState icon={<Ticket size={48} />} title="Nenhum bolão criado ainda" description="Os bolões criados aparecerão aqui agrupados por dia." />
          </Card>
        ) : (() => {
          const dayGroups = groupByDay(recentBoloes);
          const totalDays = dayGroups.length;
          const totalPages = Math.max(1, Math.ceil(totalDays / DAY_PAGE_SIZE));
          const currentPage = Math.min(dayPage, totalPages - 1);
          const startIdx = currentPage * DAY_PAGE_SIZE;
          const pagedGroups = dayGroups.slice(startIdx, startIdx + DAY_PAGE_SIZE);
          const todayStr = new Date().toISOString().split('T')[0];
          return (
            <Card className="overflow-hidden flex flex-col">
              <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100">
                {pagedGroups.map((group) => {
                  const isToday = group.key === todayStr;
                  const isExpanded = isToday || expandedDayKey === group.key;
                  const dayTotalValue = group.boloes.reduce((s, b) => s + (Number(b.price) + Number(b.service_fee)) * b.total_shares, 0);
                  return (
                    <div key={group.key} className={isToday ? 'bg-brand-50/40' : ''}>
                      <button
                        onClick={() => isToday ? null : setExpandedDayKey(isExpanded ? null : group.key)}
                        className={`w-full px-5 py-3 flex items-center gap-2 text-left transition-colors ${isToday ? 'cursor-default' : 'hover:bg-slate-50'}`}
                      >
                        {!isToday && (isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />)}
                        <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">{group.key.split('-').reverse().join('/')}</span>
                        <h3 className="font-semibold text-brand-900 flex-1 capitalize">{group.label}</h3>
                        {isToday && <Badge color="brand">Hoje</Badge>}
                        <span className="text-xs text-slate-500 shrink-0">{group.boloes.length} bolão(ões) · R$ {formatBRL(dayTotalValue)}</span>
                      </button>
                      {isExpanded && (
                        <div className="px-5 pb-3 space-y-2">
                          {group.boloes.map((b) => {
                            const statusInfo = STATUS_LABELS[b.status];
                            return (
                              <div key={b.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
                                <LotteryIcon slug={b.product?.slug ?? ''} size={28} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-slate-900 text-sm">{b.product?.name ?? '—'}</span>
                                    <span className="text-xs text-slate-400">Concurso {b.contest_number}</span>
                                    <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                                    {b.status === 'encalhado' && !b.encalhe_settled && (
                                      <Badge color="amber">Pendente de baixa</Badge>
                                    )}
                                    {b.encalhe_settled && (
                                      <Badge color="red">Baixado</Badge>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                                    <span>{b.jogos} jogo(s) de {b.dezenas} dezenas</span>
                                    <span>Cota: R$ {formatBRL(Number(b.price))} + R$ {formatBRL(Number(b.service_fee))} taxa</span>
                                    <span className="font-medium text-slate-600">Total: R$ {formatBRL((Number(b.price) + Number(b.service_fee)) * b.total_shares)}</span>
                                    <span>{b.sold_shares}/{b.total_shares} cotas vendidas</span>
                                    <span className="flex items-center gap-1">
                                      <Clock size={11} />
                                      {b.draw_date.split('-').reverse().join('/')} às {b.draw_time?.slice(0, 5)}
                                    </span>
                                  </div>
                                </div>
                                <Button size="sm" variant="secondary" onClick={() => openEdit(b)}>
                                  <Pencil size={14} /> Editar
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-sm">
                  <span className="text-slate-500">
                    Página {currentPage + 1} de {totalPages} · {totalDays} dia(s) no total
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setDayPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}>
                      <ChevronRight size={14} className="rotate-180" /> Anterior
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDayPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}>
                      Próxima <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })()}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar Bolão">
        {editing && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
              <LotteryIcon slug={editing.product?.slug ?? ''} size={32} />
              <div>
                <p className="font-semibold text-brand-950">{editing.product?.name}</p>
                <p className="text-xs text-slate-400">Concurso {editing.contest_number}</p>
              </div>
            </div>

            {(editing.status === 'sold' || editing.status === 'encalhado') && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700">
                Este bolão já está {editing.status === 'sold' ? 'totalmente vendido' : 'encalhado'}. Você ainda pode corrigir dados de cadastro, mas tenha cuidado ao mudar o total de cotas.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Número do concurso *" value={editContestNumber} onChange={setEditContestNumber} required />
              <Input label="Total de cotas *" type="number" value={editTotalShares} onChange={(v) => setEditTotalShares(Number(v))} min={1} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Data do sorteio *" type="date" value={editDrawDate} onChange={setEditDrawDate} required />
              <Input label="Horário do sorteio *" type="time" value={editDrawTime} onChange={setEditDrawTime} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantidade de dezenas *" type="number" value={editDezenas} onChange={(v) => setEditDezenas(Number(v))} min={1} required />
              <Input label="Quantidade de jogos *" type="number" value={editJogos} onChange={(v) => setEditJogos(Number(v))} min={1} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Preço da cota (R$) *" type="number" step="0.01" value={editPrice} onChange={(v) => setEditPrice(Number(v))} min={0} required />
              <Input label="Taxa por cota (R$) *" type="number" step="0.01" value={editFee} onChange={(v) => setEditFee(Number(v))} min={0} required />
            </div>

            <div className="bg-brand-50 rounded-lg p-3 text-xs text-brand-700 flex flex-wrap gap-x-6 gap-y-1">
              <span>Total do bolão ({editTotalShares} cotas): <strong>R$ {formatBRL((Number(editPrice) + Number(editFee)) * editTotalShares)}</strong></span>
              <span>Taxa total: <strong>R$ {formatBRL(Number(editFee) * editTotalShares)}</strong></span>
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Observações</span>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
              />
            </label>

            {editError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{editError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
