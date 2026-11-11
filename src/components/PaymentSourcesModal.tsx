import { useState } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Modal, Input, Button } from './ui';
import type { FinPaymentSource } from '../lib/types';

interface PaymentSourcesModalProps {
  open: boolean;
  onClose: () => void;
  branchId: string;
  sources: FinPaymentSource[];
  onChanged: () => void;
}

export function PaymentSourcesModal({ open, onClose, branchId, sources, onChanged }: PaymentSourcesModalProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Informe o nome da fonte.'); return; }
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase
      .from('fin_payment_sources')
      .insert({ branch_id: branchId, name: trimmed, active: true });
    setSaving(false);
    if (insertError) {
      setError(insertError.code === '23505' ? 'Já existe uma fonte com este nome.' : 'Não foi possível cadastrar a fonte.');
      return;
    }
    setName('');
    onChanged();
  };

  return (
    <Modal open={open} onClose={onClose} title="Fontes Pagadoras" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label="Nova fonte" value={name} onChange={setName} placeholder="Ex: Banco do Brasil" />
          </div>
          <Button onClick={add} disabled={saving}><Plus size={16} /> {saving ? 'Salvando...' : 'Cadastrar'}</Button>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
        {sources.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma fonte cadastrada nesta filial.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
            {sources.map((s) => (
              <li key={s.id} className="px-3 py-2 text-sm text-slate-700">{s.name}</li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
