import { fullReconcile } from './sync/chromeSync';

let importing = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function sync(): void {
  fullReconcile()
    .then(() => new BroadcastChannel('refound').postMessage('bookmarks-changed'))
    .catch((error) => console.warn('ReFound: bookmark sync failed', error));
}

function scheduleSync(): void {
  if (importing) return;
  clearTimeout(timer);
  timer = setTimeout(sync, 300);
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  sync();
  if (reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html#/welcome') });
  }
});
chrome.runtime.onStartup.addListener(sync);

chrome.bookmarks.onCreated.addListener(scheduleSync);
chrome.bookmarks.onRemoved.addListener(scheduleSync);
chrome.bookmarks.onChanged.addListener(scheduleSync);
chrome.bookmarks.onMoved.addListener(scheduleSync);
chrome.bookmarks.onChildrenReordered.addListener(scheduleSync);
chrome.bookmarks.onImportBegan.addListener(() => {
  importing = true;
});
chrome.bookmarks.onImportEnded.addListener(() => {
  importing = false;
  sync();
});
