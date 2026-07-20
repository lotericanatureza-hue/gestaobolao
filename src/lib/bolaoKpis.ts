// lib/bolaoKpis.ts
//
// Fonte ÚNICA da verdade para os números de bolão/comissão/encalhe.
// Tanto o dashboard do Operador quanto o do Admin devem importar daqui —
// nunca recalcular isso localmente em cada componente. É exatamente essa
// duplicação que causava divergência entre as duas telas.
//
// Regra de negócio (definida pelo usuário):
// - `price` e `service_fee` são valores POR COTA (não o total do bolão).
//   Ex: cota R$20 + taxa R$2,50 = R$22,50/cota. Com 10 cotas, o bolão
//   gerado vale R$225,00 (22,50 * 10).
// - "Gerado"     = (price + service_fee) * total_shares.
// - "Vendido"    = (price + service_fee) * sold_shares — valor já
//                  arrecadado, proporcional, independente do status final.
// - "Encalhado"  = só existe depois que a data/hora do sorteio (draw_datetime)
//                  já passou. É o valor das cotas que sobraram sem vender
//                  nesse momento: (price + service_fee) * cotas_restantes.
//                  Um bolão 100% vendido (status = 'sold') NUNCA é encalhe.
// - "Em Aberto"  = ainda não chegou a data/hora do sorteio: valor das
//                  cotas que faltam vender até lá.
//
// status = 'encalhado' agora é decidido e persistido no banco (via
// pg_cron, ver migration_encalhado.sql), então aqui só precisamos ler o
// status — não recalcular data/hora no front.

import type { Bolao } from './types';

export interface BucketKpis {
  count: number;        // quantidade de bolões
  value: number;         // soma (price + service_fee) do bucket
  commission: number;    // soma service_fee do bucket
  lotericaCommission: number; // 70%
  operatorCommission: number; // 30%
}

export interface BolaoKpis {
  gerado: BucketKpis;
  vendido: BucketKpis;
  encalhado: BucketKpis;
  emAberto: BucketKpis; // ainda não chegou a data/hora do sorteio, nem foi 100% vendido
}

function emptyBucket(): BucketKpis {
  return { count: 0, value: 0, commission: 0, lotericaCommission: 0, operatorCommission: 0 };
}

// price e service_fee já são o valor de UMA cota — não dividir por total_shares.
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
  const encalhado = emptyBucket();
  const emAberto = emptyBucket();

  for (const b of boloes) {
    const perShare = shareValue(b);
    const perShareCommission = shareCommission(b);
    const totalValue = perShare * b.total_shares;

    // Gerado: todo bolão criado entra aqui, sempre. price/service_fee são
    // por cota, então o valor gerado é (price + service_fee) * total_shares.
    gerado.count += 1;
    gerado.value += totalValue;
    gerado.commission += perShareCommission * b.total_shares;

    // Vendido: valor já arrecadado por cotas vendidas, proporcional,
    // independente do status atual do bolão.
    const soldValue = perShare * b.sold_shares;
    const soldCommissionValue = perShareCommission * b.sold_shares;
    if (b.sold_shares > 0) {
      vendido.value += soldValue;
      vendido.commission += soldCommissionValue;
      if (b.status === 'sold') vendido.count += 1; // conta bolão inteiro só quando 100% vendido
    }

    // Comissão total do bolão inteiro (por cota * total_shares) — usada como
    // base para achar o quanto de comissão ainda está em cotas não vendidas.
    const totalCommission = perShareCommission * b.total_shares;

    // Encalhado: só existe quando o status persistido no banco diz que
    // o sorteio já passou e sobrou cota sem vender.
    if (b.status === 'encalhado') {
      const unsoldValue = totalValue - soldValue;
      const unsoldCommission = totalCommission - soldCommissionValue;
      encalhado.count += 1;
      encalhado.value += unsoldValue;
      encalhado.commission += unsoldCommission;
    }

    // Em aberto: ainda não é hora do sorteio e ainda não vendeu tudo.
    if (b.status === 'pending' || b.status === 'partial') {
      emAberto.count += 1;
      emAberto.value += totalValue - soldValue;
      emAberto.commission += totalCommission - soldCommissionValue;
    }
  }

  return {
    gerado: finalizeBucket(gerado),
    vendido: finalizeBucket(vendido),
    encalhado: finalizeBucket(encalhado),
    emAberto: finalizeBucket(emAberto),
  };
}

export const STATUS_LABELS: Record<Bolao['status'], { label: string; color: 'green' | 'amber' | 'red' | 'slate' }> = {
  sold: { label: 'Vendido', color: 'green' },
  partial: { label: 'Parcial', color: 'amber' },
  pending: { label: 'Aguardando venda', color: 'slate' },
  encalhado: { label: 'Encalhado', color: 'red' },
};
