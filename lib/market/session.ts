import type { MarketSession } from './types';

export type SessionWindow = { startTime: string; endTime: string };
export type SessionCalendar = {
  day: SessionWindow | null;
  pre: SessionWindow | null;
  regular: SessionWindow | null;
  after: SessionWindow | null;
};

const SESSION_ORDER: Array<[Exclude<MarketSession, 'closed' | 'always-open'>, keyof SessionCalendar]> = [
  ['day', 'day'],
  ['pre', 'pre'],
  ['regular', 'regular'],
  ['after', 'after'],
];

export function resolveSession(now: Date, calendar: SessionCalendar): MarketSession {
  const timestamp = now.getTime();
  for (const [session, key] of SESSION_ORDER) {
    const window = calendar[key];
    if (!window) continue;
    if (timestamp >= new Date(window.startTime).getTime() && timestamp < new Date(window.endTime).getTime()) return session;
  }
  return 'closed';
}
