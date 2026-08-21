// lib/bolaoKpis.ts
//
// Fonte ÚNICA da verdade para os números de bolão/comissão.
//
// Regra de negócio:
// - `price` e `service_fee` são valores POR COTA.
// - "Gerado"     = (price + service_fee) * total_shares.
// - "Vendido"    = (price + service_fee) * sold_shares — valor arrecadado.
// - "Em Aberto"  = cotas que faltam vender e o sorteio ainda não passou.
//
// A comissão do operador é por tier (ver commission.ts):
// 10% até R$10k, 20% de R$10k-R$20k, 30% acima de R$20k — sobre a TAXA DE SERVIÇO.

import type { Bolao, BolaoOperatorAllocation } from './types';

export interface BucketKpis {
  count: number;
  shares: number;
  value: number;
  commission: number;          // total service_fee do bucket
  lotericaCommission: number;  // 70% (legacy — será recalculado por tier no frontend)
  operatorCommission: number;  // 30% (legacy — será recalculado por tier no frontend)
}

export interface BolaoKpis {
  gerado: BucketKpis;
  vendido: BucketKpis;
  emAberto: BucketKpis;
}

function emptyBucket(): BucketKpis {
  return { count: 0, shares: 0, value: 0, commission: 0, lotericaCommission: 0, operatorCommission: 0 };
}

function shareValue(b: Bolao): number {
  return Number(b.price) + Number(b.service_fee);
}

function shareCommission(b: Bolao): number {
  return Number(b.service_fee);
}

function finalizeBucket(bucket: BucketKpis): BucketKpis {
  return {
    ...bucket,
    lotericaCommission: bucket.commission * 0.7,
    operatorCommission: bucket.commission * 0.3,
  };
}

export function computeBolaoKpis(boloes: Bolao[]): BolaoKpis {
  const gerado = emptyBucket();
  const vendido = emptyBucket();
  const emAberto = emptyBucket();

  for (const b of boloes) {
    const perShare = shareValue(b);
    const perShareCommission = shareCommission(b);
    const totalValue = perShare * b.total_shares;
    const totalCommission = perShareCommission * b.total_shares;

    gerado.count += 1;
    gerado.shares += b.total_shares;
    gerado.value += totalValue;
    gerado.commission += totalCommission;

    const soldValue = perShare * b.sold_shares;
    const soldCommissionValue = perShareCommission * b.sold_shares;
    if (b.sold_shares > 0) {
      vendido.shares += b.sold_shares;
      vendido.value += soldValue;
      vendido.commission += soldCommissionValue;
      if (b.status === 'sold') vendido.count += 1;
    }

    if (b.status === 'pending' || b.status === 'partial') {
      const remainingShares = b.total_shares - b.sold_shares;
      emAberto.count += 1;
      emAberto.shares += remainingShares;
      emAberto.value += totalValue - soldValue;
      emAberto.commission += totalCommission - soldCommissionValue;
    }
  }

  return {
    gerado: finalizeBucket(gerado),
    vendido: finalizeBucket(vendido),
    emAberto: finalizeBucket(emAberto),
  };
}

export const STATUS_LABELS: Record<Bolao['status'], { label: string; color: 'green' | 'amber' | 'red' | 'slate' }> = {
  sold: { label: 'Vendido', color: 'green' },
  partial: { label: 'Parcial', color: 'amber' },
  pending: { label: 'Aguardando venda', color: 'slate' },
};

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function computeAllocationKpis(allocations: BolaoOperatorAllocation[]): BolaoKpis {
  const gerado = emptyBucket();
  const vendido = emptyBucket();
  const emAberto = emptyBucket();

  for (const a of allocations) {
    const b = a.bolao;
    if (!b || a.shares_allocated <= 0) continue;

    const perShare = shareValue(b);
    const perShareCommission = shareCommission(b);
    const totalValue = perShare * a.shares_allocated;
    const totalCommission = perShareCommission * a.shares_allocated;

    gerado.count += 1;
    gerado.shares += a.shares_allocated;
    gerado.value += totalValue;
    gerado.commission += totalCommission;

    const soldValue = perShare * a.shares_sold;
    const soldCommissionValue = perShareCommission * a.shares_sold;
    if (a.shares_sold > 0) {
      vendido.shares += a.shares_sold;
      vendido.value += soldValue;
      vendido.commission += soldCommissionValue;
      if (a.shares_sold === a.shares_allocated) vendido.count += 1;
    }

    if (b.status === 'pending' || b.status === 'partial') {
      const remainingShares = a.shares_allocated - a.shares_sold;
      emAberto.count += 1;
      emAberto.shares += remainingShares;
      emAberto.value += totalValue - soldValue;
      emAberto.commission += totalCommission - soldCommissionValue;
    }
  }

  return {
    gerado: finalizeBucket(gerado),
    vendido: finalizeBucket(vendido),
    emAberto: finalizeBucket(emAberto),
  };
}
