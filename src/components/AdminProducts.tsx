import { useEffect, useState } from 'react';
import { Package, Plus, Pencil, Trash2, Calendar, Hash, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Button, Input, Modal, Badge, Spinner, EmptyState } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import type { Product } from '../lib/types';

const emptyForm = {
  name: '', slug: '', min_dezenas: 6, max_dezenas: 20, base_price: 0, service_fee: 0, draw_frequency: '', active: true,
};

export function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    const { data } = await supabase.from('products').select('*').order('name');
    setProducts((data ?? []) as Product[]);
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, slug: p.slug, min_dezenas: p.min_dezenas, max_dezenas: p.max_dezenas,
      base_price: p.base_price, service_fee: p.service_fee, draw_frequency: p.draw_frequency ?? '', active: p.active,
    });
    setError(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      setError('Nome e slug são obrigatórios.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      min_dezenas: Number(form.min_dezenas),
      max_dezenas: Number(form.max_dezenas),
      base_price: Number(form.base_price),
      service_fee: Number(form.service_fee),
      draw_frequency: form.draw_frequency.trim() || null,
      active: form.active,
    };
    if (editing) {
      await supabase.from('products').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('products').insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    fetchProducts();
  };

  const remove = async (p: Product) => {
    if (!confirm(`Excluir o produto "${p.name}"?`)) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) {
      alert('Não foi possível excluir. O produto pode estar em uso por bolões.');
      return;
    }
    fetchProducts();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Produtos"
        subtitle="Cadastro dos produtos de loteria da Caixa"
        action={<Button onClick={openNew}><Plus size={18} /> Novo Produto</Button>}
      />

      {products.length === 0 ? (
        <Card>
          <EmptyState icon={<Package size={48} />} title="Nenhum produto cadastrado" description="Cadastre produtos de loteria para operar bolões." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <Card key={p.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <LotteryIcon slug={p.slug} size={40} />
                  <div>
                    <h3 className="font-semibold text-slate-900">{p.name}</h3>
                    <p className="text-xs text-slate-400">{p.slug}</p>
                  </div>
                </div>
                <Badge color={p.active ? 'green' : 'slate'}>{p.active ? 'Ativo' : 'Inativo'}</Badge>
              </div>
              <div className="space-y-2 text-sm text-slate-500">
                <div className="flex items-center gap-2"><Hash size={14} /> Dezenas: {p.min_dezenas} a {p.max_dezenas}</div>
                <div className="flex items-center gap-2"><DollarSign size={14} /> Preço base: R$ {Number(p.base_price).toFixed(2)}</div>
                <div className="flex items-center gap-2"><DollarSign size={14} /> Taxa de serviço: R$ {Number(p.service_fee).toFixed(2)}</div>
                {p.draw_frequency && <div className="flex items-center gap-2"><Calendar size={14} /> Sorteio: {p.draw_frequency}</div>}
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                <Button size="sm" variant="secondary" onClick={() => openEdit(p)}><Pencil size={14} /> Editar</Button>
                <Button size="sm" variant="danger" onClick={() => remove(p)}><Trash2 size={14} /> Excluir</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Produto' : 'Novo Produto'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nome *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Ex: Mega-Sena" required />
            <Input label="Slug *" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} placeholder="ex: mega-sena" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Dezenas mín." type="number" value={form.min_dezenas} onChange={(v) => setForm({ ...form, min_dezenas: Number(v) })} min={1} />
            <Input label="Dezenas máx." type="number" value={form.max_dezenas} onChange={(v) => setForm({ ...form, max_dezenas: Number(v) })} min={1} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Preço base (R$)" type="number" value={form.base_price} onChange={(v) => setForm({ ...form, base_price: Number(v) })} step="0.01" min={0} />
            <Input label="Taxa de serviço (R$)" type="number" value={form.service_fee} onChange={(v) => setForm({ ...form, service_fee: Number(v) })} step="0.01" min={0} />
          </div>
          <Input label="Frequência do sorteio" value={form.draw_frequency} onChange={(v) => setForm({ ...form, draw_frequency: v })} placeholder="Ex: quarta/sábado" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
            <span className="text-sm text-slate-700">Produto ativo</span>
          </label>
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
