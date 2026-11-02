import { type ChangeEvent, useEffect, useState } from 'react';
import { ImagePlus, Trash2, X } from 'lucide-react';
import { clearReFoundData } from '../../core/actions';
import { getStats, type Stats } from '../../core/stats';
import type { Settings, SnoozeOption } from '../../shared/types';
import { db } from '../../store/db';
import { DEFAULT_SETTINGS, saveSettings } from '../../store/settings';
import { fullReconcile } from '../../sync/chromeSync';
import type { Group } from '../backgrounds';
import { FolderPicker } from '../components/FolderPicker';
import { SNOOZE_LABELS } from '../components/SnoozeMenu';
import { useUploads } from '../components/Wallpaper';
import { announce, useSettings } from '../useApp';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const GROUPS: Group[] = ['Scenes', 'Your images', 'Gradients', 'Colors'];

function Backgrounds({ update }: { update: (patch: Partial<Settings>) => void }) {
  const settings = useSettings();
  const options = useUploads();
  const [error, setError] = useState('');

  const random = settings.backgroundMode === 'random';
  const pool = settings.randomPool.length ? settings.randomPool : options.map((o) => o.ref);

  const choose = (ref: string) => {
    if (!random) return update({ background: ref });
    update({ randomPool: pool.includes(ref) ? pool.filter((r) => r !== ref) : [...pool, ref] });
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Choose an image file.');
    if (file.size > MAX_UPLOAD_BYTES) return setError('Choose an image of 10 MB or less.');
    setError('');
    const id = crypto.randomUUID();
    try {
      await db.wallpapers.put({ id, name: file.name, blob: file, addedAt: Date.now() });
      announce();
      if (!random) update({ background: `upload:${id}` });
    } catch {
      setError("ReFound couldn't save that image.");
    }
  };

  const remove = async (ref: string) => {
    await db.wallpapers.delete(ref.slice('upload:'.length));
    announce();
    update({
      randomPool: settings.randomPool.filter((r) => r !== ref),
      ...(settings.background === ref ? { background: DEFAULT_SETTINGS.background } : {}),
    });
  };

  return (
    <>
      <div className="segmented" role="radiogroup" aria-label="Background mode">
        <label>
          <input type="radio" name="bg-mode" checked={!random} onChange={() => update({ backgroundMode: 'fixed' })} />
          <span>Keep one</span>
        </label>
        <label>
          <input type="radio" name="bg-mode" checked={random} onChange={() => update({ backgroundMode: 'random' })} />
          <span>New every day</span>
        </label>
      </div>
      {random && <p className="hint">Choose which backgrounds to rotate through.</p>}

      {GROUPS.map((group) => {
        const items = options.filter((o) => o.group === group);
        if (!items.length) return null;
        return (
          <div className="gallery" key={group}>
            <h3>{group}</h3>
            <div className="swatches">
              {items.map((o) => (
                <div className="swatch" key={o.ref}>
                  <button
                    type="button"
                    aria-pressed={random ? pool.includes(o.ref) : settings.background === o.ref}
                    style={{ background: o.thumb ?? o.css }}
                    title={o.label}
                    aria-label={o.label}
                    onClick={() => choose(o.ref)}
                  />
                  {group === 'Your images' && (
                    <button type="button" className="icon-button swatch-remove" aria-label={`Remove ${o.label}`} onClick={() => remove(o.ref)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <label className="upload">
        <ImagePlus size={17} aria-hidden="true" />
        Upload your own
        <input type="file" accept="image/*" onChange={upload} />
      </label>
      {error && <p className="hint error" role="alert">{error}</p>}

      <label className="slider">
        <span>Dim images <output>{settings.backgroundDim}%</output></span>
        <input
          type="range"
          min="0"
          max="70"
          step="5"
          value={settings.backgroundDim}
          onChange={(e) => update({ backgroundDim: Number(e.target.value) })}
        />
      </label>
    </>
  );
}

export function SettingsPanel() {
  const settings = useSettings();
  const [tab, setTab] = useState<'reading' | 'background' | 'data'>('reading');
  const [stats, setStats] = useState<Stats | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats(null));
  }, []);

  const update = (patch: Partial<Settings>) => void saveSettings(patch);

  const clear = async () => {
    await clearReFoundData();
    await fullReconcile().catch(() => {});
    announce();
    window.location.hash = '#/welcome';
  };

  return (
    <>
      <a className="panel-scrim" href="#/" aria-label="Close settings" tabIndex={-1} />
      <aside className="panel" role="dialog" aria-label="Settings">
        <div className="panel-head">
          <h1>Settings</h1>
          <a className="icon-button" href="#/" aria-label="Close settings"><X size={18} aria-hidden="true" /></a>
        </div>
        <div className="panel-tabs" role="tablist">
          {(['reading', 'background', 'data'] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {id === 'reading' ? 'Daily picks' : id === 'background' ? 'Background' : 'Your data'}
            </button>
          ))}
        </div>

        {tab === 'reading' && (
          <>
            <div className="setting">
              <div>
                <h2>Show picks</h2>
                <p>Bring bookmarks back on the new tab page.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  aria-label="Show picks on the new tab page"
                  checked={settings.showRecommendations}
                  onChange={(e) => update({ showRecommendations: e.target.checked })}
                />
                <span aria-hidden="true" />
              </label>
            </div>
            <div className="setting">
              <div>
                <h2>Quieter new tabs</h2>
                <p>Once you've opened, snoozed or dismissed a pick, later tabs show the rest on one line.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  aria-label="Quieter new tabs"
                  checked={settings.quietAfterFirst}
                  onChange={(e) => update({ quietAfterFirst: e.target.checked })}
                />
                <span aria-hidden="true" />
              </label>
            </div>
            <div className="setting">
              <div>
                <h2>Bookmarks per day</h2>
                <p>A maximum, never a to-do list.</p>
              </div>
              <div className="counter" role="radiogroup" aria-label="Bookmarks per day">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={settings.dailyCount === n} onClick={() => update({ dailyCount: n })}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting">
              <div>
                <h2>Default reminder</h2>
                <p>Marked as the default when you choose Remind later.</p>
              </div>
              <select
                aria-label="Default reminder"
                value={settings.defaultSnooze}
                onChange={(e) => update({ defaultSnooze: e.target.value as SnoozeOption })}
              >
                {(Object.keys(SNOOZE_LABELS) as SnoozeOption[]).map((o) => <option key={o} value={o}>{SNOOZE_LABELS[o]}</option>)}
              </select>
            </div>
            <div className="setting column">
              <div>
                <h2>Folders to pick from</h2>
                <p>Your library always shows everything. Changes apply from tomorrow.</p>
              </div>
              <FolderPicker excluded={settings.excludedFolderIds} onChange={(ids) => update({ excludedFolderIds: ids })} />
            </div>
          </>
        )}

        {tab === 'background' && <Backgrounds update={update} />}

        {tab === 'data' && (
          <>
            {stats && (
              <>
                <dl className="stats">
                  <div><dt>Resurfaced</dt><dd>{stats.resurfaced}</dd></div>
                  <div><dt>Opened</dt><dd>{stats.opened}</dd></div>
                  <div><dt>Open rate</dt><dd>{stats.openRate}%</dd></div>
                  <div><dt>Snoozed</dt><dd>{stats.snoozed}</dd></div>
                  <div><dt>Dismissed</dt><dd>{stats.dismissed}</dd></div>
                  <div><dt>Days with picks</dt><dd>{stats.daysActive}</dd></div>
                </dl>
                <p className="hint">These stay on this device. Opening a link doesn't mean it was read.</p>
              </>
            )}
            <div className="setting column">
              <div>
                <h2>Clear ReFound data</h2>
                <p>Removes ReFound's history, settings and uploaded images. Your Chrome bookmarks are not affected.</p>
              </div>
              {confirming ? (
                <div className="confirm">
                  <button type="button" className="danger" onClick={clear}>Clear ReFound data</button>
                  <button type="button" className="ghost" onClick={() => setConfirming(false)}>Keep my data</button>
                </div>
              ) : (
                <button type="button" className="ghost outline" onClick={() => setConfirming(true)}>Clear ReFound data</button>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
