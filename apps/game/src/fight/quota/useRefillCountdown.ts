import { useEffect, useState } from 'react';
import { formatRefillCountdown, msUntilRefill } from './fightQuotaTypes';

/**
 * Live HH:MM:SS countdown derived only from server nextRefillAt.
 * Tick every second while the target is in the future.
 */
export function useRefillCountdown(nextRefillAt: string | null | undefined): {
  readonly label: string;
  readonly expired: boolean;
  readonly msRemaining: number;
} {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!nextRefillAt) return;
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [nextRefillAt]);

  if (!nextRefillAt) {
    return { label: '00:00:00', expired: true, msRemaining: 0 };
  }
  const msRemaining = msUntilRefill(nextRefillAt, nowMs);
  return {
    label: formatRefillCountdown(msRemaining),
    expired: msRemaining <= 0,
    msRemaining,
  };
}
