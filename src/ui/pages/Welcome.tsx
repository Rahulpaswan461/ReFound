import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { db } from '../../store/db';
import { saveSettings } from '../../store/settings';
import { fullReconcile } from '../../sync/chromeSync';
import { FolderPicker } from '../components/FolderPicker';
import { useSettings } from '../useApp';

export function Welcome() {
  const settings = useSettings();
  const [excluded, setExcluded] = useState(settings.excludedFolderIds);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fullReconcile()
      .then(() => db.bookmarks.count())
      .then(setCount)
      .catch(() => setError(true));
  }, []);

  const finish = async () => {
    try {
      await fullReconcile();
      await saveSettings({ excludedFolderIds: excluded, setupComplete: true });
      window.location.hash = '#/';
    } catch (e) {
      console.warn('ReFound: setup failed', e);
      setError(true);
    }
  };

  return (
    <div className="veil">
      <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <h1 id="welcome-title">Bring back what you saved</h1>
        <p>
          {count ? `ReFound found ${count.toLocaleString()} bookmarks. ` : ''}
          Each day it brings back a few you've probably forgotten. Your bookmarks stay on this
          device, and ReFound never changes them.
        </p>
        <h2>Which folders should it pick from?</h2>
        <FolderPicker excluded={excluded} onChange={setExcluded} />
        <p className="hint">Untick folders of sites you already visit every day.</p>
        {error && <p className="hint" role="alert">ReFound couldn't read your bookmarks. Try again.</p>}
        <button type="button" className="primary" onClick={finish}>
          Start using ReFound <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
