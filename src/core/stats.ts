import { db } from '../store/db';

export interface Stats {
  resurfaced: number;
  opened: number;
  openRate: number;
  snoozed: number;
  dismissed: number;
  daysActive: number;
}

export async function getStats(): Promise<Stats> {
  const days = await db.daily.toArray();
  const slots = days.flatMap((d) => d.slots);
  const count = (status: string) => slots.filter((s) => s.status === status).length;
  const opened = count('opened');
  return {
    resurfaced: slots.length,
    opened,
    openRate: slots.length ? Math.round((opened / slots.length) * 100) : 0,
    snoozed: count('snoozed'),
    dismissed: count('dismissed'),
    daysActive: days.length,
  };
}
