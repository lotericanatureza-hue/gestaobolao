import { ReactNode } from 'react';

interface LotteryIconProps {
  size?: number;
  className?: string;
}

export function MegaSenaIcon({ size = 24, className = '' }: LotteryIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#209869" />
      <circle cx="12" cy="12" r="7" fill="white" opacity="0.15" />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">MS</text>
    </svg>
  );
}

export function LotofacilIcon({ size = 24, className = '' }: LotteryIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#930089" />
      <path d="M12 4 L13.5 9 L18.5 9 L14.5 12 L16 17 L12 14 L8 17 L9.5 12 L5.5 9 L10.5 9 Z" fill="white" opacity="0.9" />
    </svg>
  );
}

export function QuinaIcon({ size = 24, className = '' }: LotteryIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#260085" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="bold" fill="white">Q</text>
    </svg>
  );
}

export function MaisMilionariaIcon({ size = 24, className = '' }: LotteryIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#cc0000" />
      <path d="M12 5 L13.2 9.2 L17.5 9.2 L14.1 11.8 L15.3 16 L12 13.4 L8.7 16 L9.9 11.8 L6.5 9.2 L10.8 9.2 Z" fill="#FFD700" />
    </svg>
  );
}

export function LotomaniaIcon({ size = 24, className = '' }: LotteryIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#f77f00" />
      <circle cx="12" cy="12" r="5" fill="white" opacity="0.25" />
      <circle cx="12" cy="12" r="2.5" fill="white" opacity="0.8" />
    </svg>
  );
}

export function TimemaniaIcon({ size = 24, className = '' }: LotteryIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#00863f" />
      <path d="M12 6 C8.7 6 6 8.7 6 12 C6 15.3 8.7 18 12 18 C15.3 18 18 15.3 18 12 C18 8.7 15.3 6 12 6 Z" fill="white" opacity="0.2" />
      <path d="M12 7.5 L12.8 10.5 L16 11 L13.5 13.5 L14 17 L12 15.5 L10 17 L10.5 13.5 L8 11 L11.2 10.5 Z" fill="white" opacity="0.85" />
    </svg>
  );
}

export function DuplaSenaIcon({ size = 24, className = '' }: LotteryIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#c8000a" />
      <text x="9" y="13.5" textAnchor="middle" fontSize="7.5" fontWeight="bold" fill="white">2x</text>
      <text x="15.5" y="13.5" textAnchor="middle" fontSize="7.5" fontWeight="bold" fill="white">S</text>
    </svg>
  );
}

export function LotecaIcon({ size = 24, className = '' }: LotteryIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#005ca8" />
      <polygon points="12,5 14,10 19,10 15,13.5 16.5,19 12,16 7.5,19 9,13.5 5,10 10,10" fill="white" opacity="0.85" />
    </svg>
  );
}

export function DiaDeSorteIcon({ size = 24, className = '' }: LotteryIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#f4b400" />
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="white" opacity="0.2" />
      <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">DIA</text>
    </svg>
  );
}

export function SuperSeteIcon({ size = 24, className = '' }: LotteryIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#ab5000" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="bold" fill="white">7</text>
    </svg>
  );
}

const iconMap: Record<string, (props: LotteryIconProps) => ReactNode> = {
  'mega-sena': (p) => <MegaSenaIcon {...p} />,
  'lotofacil': (p) => <LotofacilIcon {...p} />,
  'quina': (p) => <QuinaIcon {...p} />,
  'mais-milionaria': (p) => <MaisMilionariaIcon {...p} />,
  '+milionaria': (p) => <MaisMilionariaIcon {...p} />,
  'lotomania': (p) => <LotomaniaIcon {...p} />,
  'timemania': (p) => <TimemaniaIcon {...p} />,
  'dupla-sena': (p) => <DuplaSenaIcon {...p} />,
  'loteca': (p) => <LotecaIcon {...p} />,
  'dia-de-sorte': (p) => <DiaDeSorteIcon {...p} />,
  'super-sete': (p) => <SuperSeteIcon {...p} />,
};

export function LotteryIcon({ slug, size = 24, className = '' }: { slug: string } & LotteryIconProps) {
  const key = slug.toLowerCase().replace(/\s+/g, '-');
  const IconFn = iconMap[key];
  if (IconFn) return <>{IconFn({ size, className })}</>;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="11" fill="#64748b" />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">
        {slug.charAt(0).toUpperCase()}
      </text>
    </svg>
  );
}
