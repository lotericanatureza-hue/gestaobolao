import { useEffect, useState, useCallback } from 'react';
import { Users, Plus, Pencil, Trash2, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from './ui';
import type { FinEmployee, Branch } from '../lib/types';

const emptyForm = { name: '', tfl: '', position: '', active: true };

export function FinancialEmployees() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [employees, setEmployees] = useState<FinEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinEmployee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const { data } = await supabase.from('fin_employees').select('*').eq('branch_id', selectedBranch).order('name');
    setEmployees((data ?? []) as FinEmployee[]);
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

  const openEdit = (e: FinEmployee) => {
    setEditing(e);
    setForm({ name: e.name, tfl: e.tfl, position: e.position ?? '', active: e.active });
    setError(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.tfl.trim()) { setError('Nome e TFL são obrigatórios.'); return; }
    setSaving(true);
    setError(null);
    const payload = {
      branch_id: selectedBranch,
      name: form.name.trim(),
      tfl: form.tfl.trim(),
      position: form.position.trim() || null,
      active: form.active,
    };
    if (editing) {
      await supabase.from('fin_employees').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('fin_employees').insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    fetchData();
  };

  const remove = async (e: FinEmployee) => {
    if (!confirm(`Excluir o funcionário "${e.name}"?`)) return;
    await supabase.from('fin_employees').delete().eq('id', e.id);
    fetchData();
  };

  if (loading && !employees.length) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Funcionários"
        subtitle="Cadastro de funcionários associados a caixa (TFL) por filial"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Select value={selectedBranch} onChange={setSelectedBranch} options={branchOptions} placeholder="Selecionar filial" />
            )}
            <Button onClick={openNew}><Plus size={18} /> Novo Funcionário</Button>
          </div>
        }
      />

      {employees.length === 0 ? (
        <Card><EmptyState icon={<Users size={48} />} title="Nenhum funcionário" description="Cadastre funcionários e associe cada um a um caixa (TFL)." /></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((e) => (
            <Card key={e.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                    <User size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{e.name}</h3>
                    <p className="text-xs text-slate-400">TFL: {e.tfl}</p>
                  </div>
                </div>
                <Badge color={e.active ? 'green' : 'slate'}>{e.active ? 'Ativo' : 'Inativo'}</Badge>
              </div>
              {e.position && <p className="text-sm text-slate-500 mb-3">Cargo: {e.position}</p>}
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                <Button size="sm" variant="secondary" onClick={() => openEdit(e)}><Pencil size={14} /> Editar</Button>
                <Button size="sm" variant="danger" onClick={() => remove(e)}><Trash2 size={14} /> Excluir</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Funcionário' : 'Novo Funcionário'}>
        <div className="space-y-4">
          <Input label="Nome *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Nome do funcionário" required />
          <Input label="TFL (Caixa) *" value={form.tfl} onChange={(v) => setForm({ ...form, tfl: v })} placeholder="Ex: TFL-001" required />
          <Input label="Cargo" value={form.position} onChange={(v) => setForm({ ...form, position: v })} placeholder="Ex: Operador de Caixa" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
            <span className="text-sm text-slate-700">Funcionário ativo</span>
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
