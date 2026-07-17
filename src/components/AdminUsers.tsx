import { useEffect, useState } from 'react';
import { Users, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Button, Select, Modal, Badge, Spinner, EmptyState } from './ui';
import type { Profile, Branch } from '../lib/types';

export function AdminUsers() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState('operator');
  const [editBranch, setEditBranch] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: p }, { data: b }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('branches').select('*').order('name'),
    ]);
    setProfiles((p ?? []) as Profile[]);
    setBranches((b ?? []) as Branch[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openEdit = (p: Profile) => {
    setEditing(p);
    setEditRole(p.role);
    setEditBranch(p.branch_id ?? '');
    setEditActive(p.active);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    await supabase.from('profiles').update({
      role: editRole,
      branch_id: editRole === 'admin' ? null : (editBranch || null),
      active: editActive,
    }).eq('id', editing.id);
    setSaving(false);
    setEditing(null);
    fetchData();
  };

  const branchName = (id: string | null) => {
    if (!id) return '—';
    return branches.find((b) => b.id === id)?.name ?? '—';
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader title="Usuários" subtitle="Gestão de operadores e administradores" />

      {profiles.length === 0 ? (
        <Card>
          <EmptyState icon={<Users size={48} />} title="Nenhum usuário cadastrado" description="Novos usuários podem se cadastrar na tela de login." />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">Nome</th>
                  <th className="px-5 py-3 font-medium">E-mail</th>
                  <th className="px-5 py-3 font-medium">Papel</th>
                  <th className="px-5 py-3 font-medium">Filial</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900">{p.name}</td>
                    <td className="px-5 py-3 text-slate-600">{p.email}</td>
                    <td className="px-5 py-3">
                      <Badge color={p.role === 'admin' ? 'orange' : 'blue'}>
                        {p.role === 'admin' ? 'Administrador' : 'Operador'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{branchName(p.branch_id)}</td>
                    <td className="px-5 py-3">
                      <Badge color={p.active ? 'green' : 'red'}>{p.active ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(p)}><Pencil size={14} /> Editar</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar Usuário">
        {editing && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-500 mb-1">Nome</p>
              <p className="font-medium text-slate-900">{editing.name}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1">E-mail</p>
              <p className="font-medium text-slate-900">{editing.email}</p>
            </div>
            <Select
              label="Papel"
              value={editRole}
              onChange={setEditRole}
              options={[
                { value: 'operator', label: 'Operador' },
                { value: 'admin', label: 'Administrador' },
              ]}
            />
            {editRole === 'operator' && (
              <Select
                label="Filial"
                value={editBranch}
                onChange={setEditBranch}
                placeholder="Selecione uma filial"
                options={branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))}
              />
            )}
            {editRole === 'admin' && (
              <p className="text-sm text-slate-400 bg-slate-50 rounded-lg p-3">
                Administradores têm acesso a todas as filiais e não precisam de alocação.
              </p>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
              <span className="text-sm text-slate-700">Usuário ativo</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
