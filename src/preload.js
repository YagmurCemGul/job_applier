import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('appBridge', {
  discoverJobs: (filters) => ipcRenderer.invoke('orchestrator:discoverJobs', filters),
  buildResume: (payload) => ipcRenderer.invoke('orchestrator:buildResume', payload),
  buildCoverLetter: (payload) => ipcRenderer.invoke('orchestrator:buildCoverLetter', payload),
  answerQuestion: (payload) => ipcRenderer.invoke('orchestrator:answerQuestion', payload)
});
