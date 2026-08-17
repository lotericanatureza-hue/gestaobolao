import { Coins } from 'lucide-react';
import { Card } from './ui';
import { formatBRL } from '../lib/format';

interface ServiceFeeGoalProps {
  title: string;
  serviceFeeTotal: number;
  goal: number;
  subtitle?: string;
}

export function ServiceFeeGoal({ title, serviceFeeTotal, goal, subtitle }: ServiceFeeGoalProps) {
  const progress = goal > 0 ? Math.min(100, (serviceFeeTotal / goal) * 100) : 0;
  const remaining = Math.max(0, goal - serviceFeeTotal);
  const reached = serviceFeeTotal >= goal;

  return (
    <Card className="p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Coins size={20} className="text-accent-600" />
        <h2 className="font-semibold text-brand-950">{title}</h2>
      </div>
      <div className="flex items-end justify-between mb-3">
        <div>
          <p className="text-xs text-slate-500">Taxa de serviço arrecadada</p>
          <p className="text-2xl font-bold text-accent-700">R$ {formatBRL(serviceFeeTotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Meta</p>
          <p className="text-lg font-semibold text-slate-700">R$ {formatBRL(goal)}</p>
        </div>
      </div>
      <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-500 to-amber-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-slate-400 mt-2">
        {reached
          ? 'Meta de taxa de serviço batida! A casa já recebeu o esperado.'
          : `${progress.toFixed(1)}% da meta · Faltam R$ ${formatBRL(remaining)} em taxa de serviço`}
      </p>
      {subtitle && <p className="text-[11px] text-slate-400 mt-1">{subtitle}</p>}
    </Card>
  );
}
