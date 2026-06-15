import { invoke } from '@tauri-apps/api/core';

export const api = {
  getConfig: () => invoke('get_config'),
  saveConfig: (config) => invoke('save_config', { config }),
  getStatus: () => invoke('get_status'),
  getUsageData: () => invoke('get_usage_data'),
  getProjects: () => invoke('get_projects'),
  uploadNow: () => invoke('upload_now'),
  getLogs: () => invoke('get_logs'),
};
