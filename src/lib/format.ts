export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formats a date string (YYYY-MM-DD) as dd/MM/yyyy without timezone shifting.
 * new Date('2026-09-23') parses as UTC midnight, which displays as the previous
 * day in UTC-3. This function splits the string manually to avoid that.
 */
export function formatDateBR(dateStr: string, opts?: { weekday?: 'short' | 'long' | 'narrow' }): string {
  if (!dateStr) return '—';
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return '—';
  if (opts?.weekday) {
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    const weekdays: Record<string, string[]> = {
      short: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
      long: ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
      narrow: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
    };
    const wd = weekdays[opts.weekday][date.getDay()] ?? '';
    return `${wd}, ${d}/${m}/${y}`;
  }
  return `${d}/${m}/${y}`;
}
