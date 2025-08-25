import { type Signal, type Price, type SystemStatus, type BestSignalResponse } from "@shared/schema";

const API_BASE = "/api";

export const api = {
  signals: {
    getCurrent: (): Promise<Signal> =>
      fetch(`${API_BASE}/signals/current`).then(res => res.json()),
    
    getBestLongShort: (): Promise<BestSignalResponse> =>
      fetch(`${API_BASE}/signals/best-long-short`).then(res => res.json()),
    
    getHistory: (limit: number = 10): Promise<Signal[]> =>
      fetch(`${API_BASE}/signals/history?limit=${limit}`).then(res => res.json()),
  },
  
  prices: {
    getLatest: (): Promise<Price[]> =>
      fetch(`${API_BASE}/prices/latest`).then(res => res.json()),
  },
  
  system: {
    getStatus: (): Promise<SystemStatus> =>
      fetch(`${API_BASE}/system/status`).then(res => res.json()),
  },
};
