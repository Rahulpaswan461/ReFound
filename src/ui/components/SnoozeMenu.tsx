import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, CalendarDays, Clock, Sunrise } from 'lucide-react';
import { dayKey, snoozeUntil } from '../../shared/time';
import type { SnoozeOption } from '../../shared/types';
import { useSettings } from '../useApp';

export const SNOOZE_LABELS: Record<SnoozeOption, string> = {
  tomorrow: 'Tomorrow',
  '3days': 'In three days',
  nextWeek: 'Next week',
};

const ICONS = { tomorrow: Sunrise, '3days': CalendarDays, nextWeek: CalendarClock };
const MENU_WIDTH = 248;

export function SnoozeMenu({ onSnooze, iconOnly = false }: { onSnooze: (until: number) => void; iconOnly?: boolean }) {
  const { defaultSnooze } = useSettings();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [place, setPlace] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const button = trigger.current.getBoundingClientRect();
    const height = menu.current.offsetHeight;
    const below = button.bottom + 8 + height <= window.innerHeight;
    setPlace({
      top: below ? button.bottom + 8 : Math.max(8, button.top - height - 8),
      left: Math.min(Math.max(8, button.left), window.innerWidth - MENU_WIDTH - 8),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (option: SnoozeOption) => {
    setOpen(false);
    onSnooze(snoozeUntil(option, new Date()));
  };

  const pickDate = (event: FormEvent) => {
    event.preventDefault();
    const [y, m, d] = date.split('-').map(Number);
    if (!y) return;
    setOpen(false);
    onSnooze(new Date(y, m - 1, d).getTime());
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={iconOnly ? 'icon-button' : 'ghost'}
        aria-label="Remind later"
        title="Remind later"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <Clock size={iconOnly ? 16 : 17} aria-hidden="true" />
        {!iconOnly && 'Remind later'}
      </button>
      {open &&
        createPortal(
          <div className="menu" ref={menu} style={{ ...place, width: MENU_WIDTH }}>
            <p>Remind me</p>
            {(Object.keys(SNOOZE_LABELS) as SnoozeOption[]).map((option) => {
              const Icon = ICONS[option];
              return (
                <button type="button" key={option} onClick={() => pick(option)}>
                  <Icon size={16} aria-hidden="true" />
                  {SNOOZE_LABELS[option]}
                  {option === defaultSnooze && <small>Default</small>}
                </button>
              );
            })}
            <form onSubmit={pickDate}>
              <input
                type="date"
                aria-label="Choose a date"
                min={dayKey(tomorrow)}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <button type="submit" disabled={!date}>Set</button>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
