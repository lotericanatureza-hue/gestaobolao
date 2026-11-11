import { AlertTriangle, CalendarClock } from 'lucide-react';
import { Card } from './ui';
import { formatBRL, formatDateBR } from '../lib/format';
import type { FinBill } from '../lib/types';

const todayKey = () => new Date().toLocaleDateString('en-CA');

function ReminderList({ title, bills, tone }: { title: string; bills: FinBill[]; tone: 'amber' | 'red' }) {
  const colors = tone === 'red'
    ? { box: 'border-red-200 bg-red-50', text: 'text-red-700', icon: 'text-red-600' }
    : { box: 'border-amber-200 bg-amber-50', text: 'text-amber-700', icon: 'text-amber-600' };
  return (
    <Card className={`p-4 border ${colors.box}`}>
      <div className={`flex items-center gap-2 font-semibold text-sm mb-2 ${colors.text}`}>
        {tone === 'red' ? <AlertTriangle size={18} className={colors.icon} /> : <CalendarClock size={18} className={colors.icon} />}
        {title} ({bills.length})
      </div>
      <ul className="space-y-1">
        {bills.map((b) => (
          <li key={b.id} className="flex items-center justify-between text-sm text-slate-700 gap-4">
            <span className="truncate">{b.description}{b.due_date && <span className="text-slate-400 text-xs"> · venc. {formatDateBR(b.due_date)}</span>}</span>
            <span className="font-semibold whitespace-nowrap">R$ {formatBRL(Number(b.amount))}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function BillReminders({ bills }: { bills: FinBill[] }) {
  const today = todayKey();
  const openExpenses = bills.filter((b) => b.type === 'expense' && b.status === 'pending' && b.due_date);
  const dueToday = openExpenses.filter((b) => b.due_date === today);
  const overdue = openExpenses.filter((b) => (b.due_date as string) < today);

  if (dueToday.length === 0 && overdue.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {overdue.length > 0 && <ReminderList title="Contas vencidas" bills={overdue} tone="red" />}
      {dueToday.length > 0 && <ReminderList title="Vencem hoje" bills={dueToday} tone="amber" />}
    </div>
  );
}
