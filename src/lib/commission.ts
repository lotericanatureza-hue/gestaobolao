// lib/commission.ts
//
// Lógica de comissão por meta mensal do operador.
//
// A META é baseada no VALOR TOTAL vendido (price + service_fee) por cota.
// A COMISSÃO é calculada sobre a TAXA DE SERVIÇO (service_fee) — a diferença
// (price) fica com a casa.
//
// Tiers (baseados no valor total vendido no mês):
// - Até R$10.000,00 → 10% da taxa de serviço para o operador
// - De R$10.000,01 a R$20.000,00 → 20% da taxa de serviço
// - Acima de R$20.000,01 → 30% da taxa de serviço

export const TIER_1_LIMIT = 10000;
export const TIER_2_LIMIT = 20000;

export interface CommissionTier {
  rate: number;
  label: string;
  minLabel: string;
  maxLabel: string;
  color: 'slate' | 'amber' | 'emerald';
}

export const COMMISSION_TIERS: CommissionTier[] = [
  { rate: 0.10, label: '10%', minLabel: 'R$ 0', maxLabel: 'R$ 10.000,00', color: 'slate' },
  { rate: 0.20, label: '20%', minLabel: 'R$ 10.000,01', maxLabel: 'R$ 20.000,00', color: 'amber' },
  { rate: 0.30, label: '30%', minLabel: 'R$ 20.000,01', maxLabel: 'sem limite', color: 'emerald' },
];

export function getCommissionRate(totalSalesValue: number): number {
  if (totalSalesValue <= TIER_1_LIMIT) return 0.10;
  if (totalSalesValue <= TIER_2_LIMIT) return 0.20;
  return 0.30;
}

export function getCommissionTier(totalSalesValue: number): CommissionTier {
  if (totalSalesValue <= TIER_1_LIMIT) return COMMISSION_TIERS[0];
  if (totalSalesValue <= TIER_2_LIMIT) return COMMISSION_TIERS[1];
  return COMMISSION_TIERS[2];
}

export function getCurrentTierIndex(totalSalesValue: number): number {
  if (totalSalesValue <= TIER_1_LIMIT) return 0;
  if (totalSalesValue <= TIER_2_LIMIT) return 1;
  return 2;
}

export function getNextTier(totalSalesValue: number): CommissionTier | null {
  const idx = getCurrentTierIndex(totalSalesValue);
  if (idx >= COMMISSION_TIERS.length - 1) return null;
  return COMMISSION_TIERS[idx + 1];
}

export function getProgressToNextTier(totalSalesValue: number): number {
  if (totalSalesValue <= TIER_1_LIMIT) {
    return Math.min(100, (totalSalesValue / TIER_1_LIMIT) * 100);
  }
  if (totalSalesValue <= TIER_2_LIMIT) {
    const range = TIER_2_LIMIT - TIER_1_LIMIT;
    const progress = totalSalesValue - TIER_1_LIMIT;
    return Math.min(100, (progress / range) * 100);
  }
  return 100;
}

export function getRemainingToNextTier(totalSalesValue: number): number {
  if (totalSalesValue <= TIER_1_LIMIT) return TIER_1_LIMIT - totalSalesValue;
  if (totalSalesValue <= TIER_2_LIMIT) return TIER_2_LIMIT - totalSalesValue;
  return 0;
}

// Comissão: taxa de serviço vendida × rate do tier (determinado pelo valor total)
export function calculateTieredCommission(totalSalesValue: number, serviceFeeSold: number): number {
  const rate = getCommissionRate(totalSalesValue);
  return serviceFeeSold * rate;
}

export const GROUP_MONTHLY_GOAL = 50000;
