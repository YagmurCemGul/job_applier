import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('appBridge', {
  discoverJobs: (filters) => ipcRenderer.invoke('orchestrator:discoverJobs', filters),
  buildResume: (payload) => ipcRenderer.invoke('orchestrator:buildResume', payload),
  buildCoverLetter: (payload) => ipcRenderer.invoke('orchestrator:buildCoverLetter', payload),
  answerQuestion: (payload) => ipcRenderer.invoke('orchestrator:answerQuestion', payload),
  getVaultEntries: () => ipcRenderer.invoke('orchestrator:getVaultEntries'),
  saveVaultEntry: (entry) => ipcRenderer.invoke('orchestrator:saveVaultEntry', entry),
  deleteVaultEntry: (questionKey) => ipcRenderer.invoke('orchestrator:deleteVaultEntry', questionKey),
  listApplications: () => ipcRenderer.invoke('orchestrator:listApplications'),
  applyToJob: (jobId, options) => ipcRenderer.invoke('orchestrator:applyToJob', { jobId, options }),
  updateApplicationStatus: (applicationId, status) =>
    ipcRenderer.invoke('orchestrator:updateApplicationStatus', { applicationId, status }),
  getProfile: () => ipcRenderer.invoke('orchestrator:getProfile'),
  updateProfile: (patch) => ipcRenderer.invoke('orchestrator:updateProfile', patch),
  askForMissing: (fields) => ipcRenderer.invoke('orchestrator:askForMissing', fields),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  bindSession: (provider, sessionProfile) =>
    ipcRenderer.invoke('settings:bindSession', { provider, sessionProfile }),
  testSession: () => ipcRenderer.invoke('settings:testSession')
});
