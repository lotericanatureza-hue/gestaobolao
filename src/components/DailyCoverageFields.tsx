import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, MoneyInput, Select } from './ui';
import { maskBRL, parseBRL, formatBRL } from '../lib/format';
import type { DailyDeposit } from '../lib/types';

export type CoverageType = 'deposit' | 'bank_balance' | '';

interface DailyCoverageFieldsProps {
  cover: string;
  onCoverChange: (v: string) => void;
  coverType: CoverageType;
  onCoverTypeChange: (v: CoverageType) => void;
  bankBalance: string;
  onBankBalanceChange: (v: string) => void;
  deposits: DailyDeposit[];
  onDepositsChange: (d: DailyDeposit[]) => void;
}

export function DailyCoverageFields({
  cover,
  onCoverChange,
  coverType,
  onCoverTypeChange,
  bankBalance,
  onBankBalanceChange,
  deposits,
  onDepositsChange,
}: DailyCoverageFieldsProps) {
  const coverFilled = parseBRL(cover) > 0;
  const depositsTotal = deposits.reduce((s, d) => s + Number(d.amount), 0);

  const addDeposit = () => onDepositsChange([...deposits, { id: crypto.randomUUID(), origin: '', amount: 0 }]);
  const updateDeposit = (id: string, field: 'origin' | 'amount', value: string) => {
    onDepositsChange(deposits.map((d) => d.id === id ? { ...d, [field]: field === 'amount' ? parseBRL(value) : value } : d));
  };
  const removeDeposit = (id: string) => onDepositsChange(deposits.filter((d) => d.id !== id));

  return (
    <div className="space-y-4">
      <MoneyInput label="Cobertura 003 (R$)" value={cover} onChange={onCoverChange} />
      {coverFilled && (
        <div className="space-y-4 rounded-lg border border-slate-200 p-4">
          <Select
            label="Tipo da cobertura"
            value={coverType}
            onChange={(v) => onCoverTypeChange(v as CoverageType)}
            options={[
              { value: 'deposit', label: 'Depósito' },
              { value: 'bank_balance', label: 'Saldo em conta' },
            ]}
            placeholder="Selecione"
          />

          {coverType === 'deposit' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Depósitos</label>
                <Button size="sm" variant="secondary" onClick={addDeposit}><Plus size={14} /> Adicionar</Button>
              </div>
              {deposits.length === 0 && (
                <p className="text-sm text-slate-400">Nenhum depósito adicionado.</p>
              )}
              {deposits.map((d) => (
                <div key={d.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <MoneyInput value={maskBRL(String(Math.round(d.amount * 100)))} onChange={(v) => updateDeposit(d.id, 'amount', v)} placeholder="Valor" />
                  </div>
                  <div className="flex-1">
                    <Input type="text" value={d.origin} onChange={(v) => updateDeposit(d.id, 'origin', v)} placeholder="Origem" />
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeDeposit(d.id)}><Trash2 size={14} /></Button>
                </div>
              ))}
              {deposits.length > 0 && (
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-slate-600">Total depositado</span>
                  <span className="text-sm font-bold text-brand-700">R$ {formatBRL(depositsTotal)}</span>
                </div>
              )}
            </div>
          )}

          {coverType === 'bank_balance' && (
            <MoneyInput label="Saldo em conta (R$)" value={bankBalance} onChange={onBankBalanceChange} />
          )}
        </div>
      )}
    </div>
  );
}
