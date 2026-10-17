const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  setMini: (on) => ipcRenderer.invoke('mini', on),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  packs: {
    list: () => ipcRenderer.invoke('packs:list'),
    import: () => ipcRenderer.invoke('packs:import'),
    open: () => ipcRenderer.invoke('packs:open'),
    remove: (id) => ipcRenderer.invoke('packs:remove', id),
  },
});
