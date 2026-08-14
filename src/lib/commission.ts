// lib/commission.ts
//
// Lógica de comissão por meta mensal do operador.
// A porcentagem é sobre a TAXA DE SERVIÇO (service_fee), não sobre o valor total.
// A diferença de valor (price) fica com a casa.
//
// Tiers:
// - Até R$10.000,00 em taxa de serviço vendida → 10% para o operador
// - De R$10.000,01 a R$20.000,00 → 20% para o operador
// - Acima de R$20.000,01 → 30% para o operador
//
// A meta é mensal: acumula a taxa de serviço vendida no mês corrente.

export const TIER_1_LIMIT = 10000; // Até R$10.000
export const TIER_2_LIMIT = 20000; // Até R$20.000

export interface CommissionTier {
  rate: number; // 0.10, 0.20, 0.30
  label: string;
  minLabel: string;
  maxLabel: string;
  color: 'slate' | 'amber' | 'emerald';
}

export const COMMISSION_TIERS: CommissionTier[] = [
  {
    rate: 0.10,
    label: '10%',
    minLabel: 'R$ 0',
    maxLabel: 'R$ 10.000,00',
    color: 'slate',
  },
  {
    rate: 0.20,
    label: '20%',
    minLabel: 'R$ 10.000,01',
    maxLabel: 'R$ 20.000,00',
    color: 'amber',
  },
  {
    rate: 0.30,
    label: '30%',
    minLabel: 'R$ 20.000,01',
    maxLabel: 'sem limite',
    color: 'emerald',
  },
];

export function getCommissionRate(serviceFeeSold: number): number {
  if (serviceFeeSold <= TIER_1_LIMIT) return 0.10;
  if (serviceFeeSold <= TIER_2_LIMIT) return 0.20;
  return 0.30;
}

export function getCommissionTier(serviceFeeSold: number): CommissionTier {
  if (serviceFeeSold <= TIER_1_LIMIT) return COMMISSION_TIERS[0];
  if (serviceFeeSold <= TIER_2_LIMIT) return COMMISSION_TIERS[1];
  return COMMISSION_TIERS[2];
}

export function getCurrentTierIndex(serviceFeeSold: number): number {
  if (serviceFeeSold <= TIER_1_LIMIT) return 0;
  if (serviceFeeSold <= TIER_2_LIMIT) return 1;
  return 2;
}

export function getNextTier(serviceFeeSold: number): CommissionTier | null {
  const idx = getCurrentTierIndex(serviceFeeSold);
  if (idx >= COMMISSION_TIERS.length - 1) return null;
  return COMMISSION_TIERS[idx + 1];
}

export function getProgressToNextTier(serviceFeeSold: number): number {
  if (serviceFeeSold <= TIER_1_LIMIT) {
    return Math.min(100, (serviceFeeSold / TIER_1_LIMIT) * 100);
  }
  if (serviceFeeSold <= TIER_2_LIMIT) {
    const range = TIER_2_LIMIT - TIER_1_LIMIT;
    const progress = serviceFeeSold - TIER_1_LIMIT;
    return Math.min(100, (progress / range) * 100);
  }
  return 100;
}

export function getRemainingToNextTier(serviceFeeSold: number): number {
  if (serviceFeeSold <= TIER_1_LIMIT) return TIER_1_LIMIT - serviceFeeSold;
  if (serviceFeeSold <= TIER_2_LIMIT) return TIER_2_LIMIT - serviceFeeSold;
  return 0;
}

export function calculateOperatorCommission(serviceFeeSold: number): number {
  const rate = getCommissionRate(serviceFeeSold);
  return serviceFeeSold * rate;
}

// Comissão calculada por tier (apenas para exibição detalhada)
export function calculateTieredCommission(serviceFeeSold: number): number {
  if (serviceFeeSold <= TIER_1_LIMIT) {
    return serviceFeeSold * 0.10;
  }
  if (serviceFeeSold <= TIER_2_LIMIT) {
    const tier1Amount = TIER_1_LIMIT * 0.10;
    const tier2Amount = (serviceFeeSold - TIER_1_LIMIT) * 0.20;
    return tier1Amount + tier2Amount;
  }
  const tier1Amount = TIER_1_LIMIT * 0.10;
  const tier2Amount = (TIER_2_LIMIT - TIER_1_LIMIT) * 0.20;
  const tier3Amount = (serviceFeeSold - TIER_2_LIMIT) * 0.30;
  return tier1Amount + tier2Amount + tier3Amount;
}

export const GROUP_MONTHLY_GOAL = 50000; // Meta mensal do grupo (em taxa de serviço)
