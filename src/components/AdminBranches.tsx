import { useEffect, useState } from 'react';
import { Store, Plus, Pencil, Trash2, MapPin, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Button, Input, Modal, Badge, Spinner, EmptyState } from './ui';
import type { Branch } from '../lib/types';

const emptyForm = { name: '', code: '', address: '', city: '', state: '', phone: '', active: true };

export function AdminBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBranches = async () => {
    setLoading(true);
    const { data } = await supabase.from('branches').select('*').order('name');
    setBranches((data ?? []) as Branch[]);
    setLoading(false);
  };

  useEffect(() => { fetchBranches(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEditing(b);
    setForm({ name: b.name, code: b.code, address: b.address ?? '', city: b.city ?? '', state: b.state ?? '', phone: b.phone ?? '', active: b.active });
    setError(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      setError('Nome e código são obrigatórios.');
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim().toUpperCase() || null,
      phone: form.phone.trim() || null,
      active: form.active,
    };
    if (editing) {
      await supabase.from('branches').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('branches').insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    fetchBranches();
  };

  const remove = async (b: Branch) => {
    if (!confirm(`Excluir a filial "${b.name}"?`)) return;
    await supabase.from('branches').delete().eq('id', b.id);
    fetchBranches();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-emerald-500" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Filiais"
        subtitle="Cadastro de lojas filiais"
        action={<Button onClick={openNew}><Plus size={18} /> Nova Filial</Button>}
      />

      {branches.length === 0 ? (
        <Card>
          <EmptyState icon={<Store size={48} />} title="Nenhuma filial cadastrada" description="Clique em 'Nova Filial' para começar." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {branches.map((b) => (
            <Card key={b.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Store size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{b.name}</h3>
                    <p className="text-xs text-slate-400">Código: {b.code}</p>
                  </div>
                </div>
                <Badge color={b.active ? 'green' : 'slate'}>{b.active ? 'Ativa' : 'Inativa'}</Badge>
              </div>
              <div className="space-y-1.5 text-sm text-slate-500">
                {b.address && <div className="flex items-center gap-2"><MapPin size={14} /> {b.address}</div>}
                {b.city && <div className="text-slate-400">{b.city}/{b.state}</div>}
                {b.phone && <div className="flex items-center gap-2"><Phone size={14} /> {b.phone}</div>}
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                <Button size="sm" variant="secondary" onClick={() => openEdit(b)}><Pencil size={14} /> Editar</Button>
                <Button size="sm" variant="danger" onClick={() => remove(b)}><Trash2 size={14} /> Excluir</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Filial' : 'Nova Filial'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nome *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Ex: Lotérica Centro" required />
            <Input label="Código *" value={form.code} onChange={(v) => setForm({ ...form, code: v })} placeholder="Ex: 001" required />
          </div>
          <Input label="Endereço" value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="Rua, número, bairro" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Cidade" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            <Input label="UF" value={form.state} onChange={(v) => setForm({ ...form, state: v })} placeholder="Ex: SP" />
          </div>
          <Input label="Telefone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="(11) 1234-5678" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" />
            <span className="text-sm text-slate-700">Filial ativa</span>
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
