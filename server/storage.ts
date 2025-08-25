import { type Signal, type InsertSignal, type Price, type InsertPrice, type SystemStatus, type InsertSystemStatus } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Signals
  getSignal(id: string): Promise<Signal | undefined>;
  getLatestSignal(): Promise<Signal | undefined>;
  getRecentSignals(limit?: number): Promise<Signal[]>;
  createSignal(signal: InsertSignal): Promise<Signal>;
  updateSignal(id: string, updates: Partial<Signal>): Promise<Signal | undefined>;
  
  // Prices
  getPrice(id: string): Promise<Price | undefined>;
  getLatestPrices(): Promise<Price[]>;
  getPricesBySymbol(symbol: string, limit?: number): Promise<Price[]>;
  createPrice(price: InsertPrice): Promise<Price>;
  
  // System Status
  getLatestSystemStatus(): Promise<SystemStatus | undefined>;
  createSystemStatus(status: InsertSystemStatus): Promise<SystemStatus>;
}

export class MemStorage implements IStorage {
  private signals: Map<string, Signal> = new Map();
  private prices: Map<string, Price> = new Map();
  private systemStatuses: Map<string, SystemStatus> = new Map();

  // Signals
  async getSignal(id: string): Promise<Signal | undefined> {
    return this.signals.get(id);
  }

  async getLatestSignal(): Promise<Signal | undefined> {
    const signals = Array.from(this.signals.values())
      .filter(s => s.isActive)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    return signals[0];
  }

  async getRecentSignals(limit: number = 10): Promise<Signal[]> {
    return Array.from(this.signals.values())
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, limit);
  }

  async createSignal(insertSignal: InsertSignal): Promise<Signal> {
    const id = randomUUID();
    const signal: Signal = {
      ...insertSignal,
      id,
      createdAt: new Date(),
      expiresAt: null,
      fees: insertSignal.fees ?? 0,
      funding: insertSignal.funding ?? 0,
      slippage: insertSignal.slippage ?? 0,
      isActive: insertSignal.isActive ?? true,
    };
    this.signals.set(id, signal);
    return signal;
  }

  async updateSignal(id: string, updates: Partial<Signal>): Promise<Signal | undefined> {
    const signal = this.signals.get(id);
    if (!signal) return undefined;
    
    const updated = { ...signal, ...updates };
    this.signals.set(id, updated);
    return updated;
  }

  // Prices
  async getPrice(id: string): Promise<Price | undefined> {
    return this.prices.get(id);
  }

  async getLatestPrices(): Promise<Price[]> {
    const pricesBySymbol = new Map<string, Price>();
    
    // Get latest price for each symbol
    const priceArray = Array.from(this.prices.values());
    for (const price of priceArray) {
      const existing = pricesBySymbol.get(price.symbol);
      if (!existing || new Date(price.timestamp!).getTime() > new Date(existing.timestamp!).getTime()) {
        pricesBySymbol.set(price.symbol, price);
      }
    }
    
    return Array.from(pricesBySymbol.values());
  }

  async getPricesBySymbol(symbol: string, limit: number = 100): Promise<Price[]> {
    return Array.from(this.prices.values())
      .filter(p => p.symbol === symbol)
      .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
      .slice(0, limit);
  }

  async createPrice(insertPrice: InsertPrice): Promise<Price> {
    const id = randomUUID();
    const price: Price = {
      ...insertPrice,
      id,
      timestamp: new Date(),
      change24h: insertPrice.change24h ?? 0,
    };
    this.prices.set(id, price);
    return price;
  }

  // System Status
  async getLatestSystemStatus(): Promise<SystemStatus | undefined> {
    const statuses = Array.from(this.systemStatuses.values())
      .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime());
    return statuses[0];
  }

  async createSystemStatus(insertStatus: InsertSystemStatus): Promise<SystemStatus> {
    const id = randomUUID();
    const status: SystemStatus = {
      ...insertStatus,
      id,
      timestamp: new Date(),
      dataFreshness: insertStatus.dataFreshness ?? null,
      activePairs: insertStatus.activePairs ?? 0,
      websocketConnections: insertStatus.websocketConnections ?? 0,
      providers: insertStatus.providers ?? null,
      performance: insertStatus.performance ?? null,
    };
    this.systemStatuses.set(id, status);
    return status;
  }
}

export const storage = new MemStorage();
