const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lorekeeper', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  saveDataAllowShrink: (data, reason) => ipcRenderer.invoke('save-data-allow-shrink', { data, reason }),
  onFlushBeforeClose: (cb) => ipcRenderer.on('flush-before-close', cb),
  flushComplete: () => ipcRenderer.send('flush-complete'),
  exportFile: (opts) => ipcRenderer.invoke('export-file', opts),
  saveImage: (opts) => ipcRenderer.invoke('save-image', opts),
  pasteImage: () => ipcRenderer.invoke('paste-image'),
  importFile: () => ipcRenderer.invoke('import-file'),
  importImage: (opts) => ipcRenderer.invoke('import-image', opts),
  importImages: (opts) => ipcRenderer.invoke('import-images', opts),
  readImagePath: (relPath) => ipcRenderer.invoke('read-image-path', relPath),
  scanCompanions: () => ipcRenderer.invoke('scan-companions'),
  scanLorebooks: () => ipcRenderer.invoke('scan-lorebooks'),
  scanCollections: () => ipcRenderer.invoke('scan-collections'),
  listFolderImages: (subfolder) => ipcRenderer.invoke('list-folder-images', subfolder),
  openFolder: (relPath) => ipcRenderer.invoke('open-folder', relPath),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  saveCompanionJson: (folderName, data) => ipcRenderer.invoke('save-companion-json', { folderName, data }),
  saveLorebookJson: (filename, data) => ipcRenderer.invoke('save-lorebook-json', { filename, data }),
  saveCollectionJson: (filename, data) => ipcRenderer.invoke('save-collection-json', { filename, data }),
  saveNotesFile: (filename, content) => ipcRenderer.invoke('save-notes-file', { filename, content }),
  saveTemplateFile: (filename, data) => ipcRenderer.invoke('save-template-file', { filename, data }),
  savePersonaFile: (filename, data) => ipcRenderer.invoke('save-persona-file', { filename, data }),
  copyImageToFolder: (srcPath, destFolder, filename) => ipcRenderer.invoke('copy-image-to-folder', { srcPath, destFolder, filename }),
  writeImageFromBase64: (opts) => ipcRenderer.invoke('write-image-from-base64', opts),
  exportBackup: (opts) => ipcRenderer.invoke('export-backup', opts),
  exportPlatformZip: (opts) => ipcRenderer.invoke('export-platform-zip', opts),
  restoreBackup: () => ipcRenderer.invoke('restore-backup'),
  restoreLastgood: () => ipcRenderer.invoke('restore-lastgood'),
  getLastgoodInfo: () => ipcRenderer.invoke('get-lastgood-info'),
  syncToGit: () => ipcRenderer.invoke('sync-to-git'),
  getSyncInfo: () => ipcRenderer.invoke('get-sync-info'),
  setSyncPaths: (paths) => ipcRenderer.invoke('set-sync-paths', paths),
  openBackupFolder: (which) => ipcRenderer.invoke('open-backup-folder', which),

  // ── GitHub backup (Stage 3b) ──────────────────────────
  // The API route. Nothing here touches the git binary or the sync script.
  githubStatus: () => ipcRenderer.invoke('github-status'),
  githubSetToken: (token) => ipcRenderer.invoke('github-set-token', token),
  githubClearToken: () => ipcRenderer.invoke('github-clear-token'),
  githubListRepos: () => ipcRenderer.invoke('github-list-repos'),
  githubCheckRepo: (repo) => ipcRenderer.invoke('github-check-repo', repo),
  githubSync: (opts) => ipcRenderer.invoke('github-sync', opts),
  githubPreview: () => ipcRenderer.invoke('github-preview'),

  // ── rclone: Google Drive, OneDrive, Dropbox ───────────
  rcloneStatus: () => ipcRenderer.invoke('rclone-status'),
  rcloneConnect: (opts) => ipcRenderer.invoke('rclone-connect', opts),
  rcloneDisconnect: () => ipcRenderer.invoke('rclone-disconnect'),
  onRcloneConnectProgress: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('rclone-connect-progress', handler);
    return () => ipcRenderer.removeListener('rclone-connect-progress', handler);
  },
  // A first sync uploads everything, which can take a while. Without a progress
  // line the window looks frozen, and a backup that looks broken gets cancelled.
  onGithubSyncProgress: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on('github-sync-progress', handler);
    return () => ipcRenderer.removeListener('github-sync-progress', handler);
  },
});
