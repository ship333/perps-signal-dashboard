import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/use-websocket";
import { type WSMessage, type Signal, type Price, type SystemStatus } from "@shared/schema";
import SystemStatusComponent from "../components/system-status";
import SignalCard from "../components/signal-card";
import SignalHistory from "../components/signal-history";
import FundingRateChart from "../components/funding-rate-chart";
import ConnectionStatus from "../components/connection-status";
import { TrendingUp, Clock, Info, ChevronDown } from "lucide-react";

interface TopHedgePair {
  pairA: string;
  pairB: string;
  signalType: 'LONG_SPREAD' | 'SHORT_SPREAD';
  zScore: number;
  hedgeRatio: number;
  confidence: number;
  period: string;
  timestamp: string;
  currentPrices: { a: number; b: number };
}

function MetricsInfoDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className="px-3 py-1 bg-primary rounded text-sm font-medium flex items-center space-x-2 hover:bg-primary/80 transition-colors"
        data-testid="metrics-info-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Info className="h-4 w-4" />
        <span>Metrics Info</span>
        <ChevronDown className="h-3 w-3" />
      </button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-96 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 p-4">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg text-accent">Trading Metrics Explained</h3>
              
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-white">Z-Score</h4>
                  <p className="text-sm text-gray-300">Measures how many standard deviations the current price spread is from its historical mean. Values above +2 or below -2 indicate strong divergence opportunities.</p>
                </div>
                
                <div>
                  <h4 className="font-medium text-white">Hedge Ratio (β)</h4>
                  <p className="text-sm text-gray-300">The optimal ratio for hedging positions between two assets. Shows how many units of asset B to trade for every unit of asset A to maintain market neutrality.</p>
                </div>
                
                <div>
                  <h4 className="font-medium text-white">Confidence</h4>
                  <p className="text-sm text-gray-300">Statistical reliability of the trading signal, calculated from historical correlation strength. Higher confidence indicates more reliable arbitrage opportunities.</p>
                </div>
                
                <div>
                  <h4 className="font-medium text-white">Expected Edge</h4>
                  <p className="text-sm text-gray-300">Anticipated profit in basis points (bps) from the statistical arbitrage trade, accounting for mean reversion probability and historical spread patterns.</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [lastUpdate, setLastUpdate] = useState<string>(new Date().toLocaleTimeString('en-US', { hour12: false }));
  
  // Query for initial data
  const { data: systemStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["/api/system/status"],
    queryFn: api.system.getStatus,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const { data: bestSignal, refetch: refetchSignal } = useQuery({
    queryKey: ["/api/signals/best-long-short"],
    queryFn: api.signals.getBestLongShort,
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  const { data: prices, refetch: refetchPrices } = useQuery({
    queryKey: ["/api/prices/latest"],
    queryFn: api.prices.getLatest,
    refetchInterval: 3000, // Refetch every 3 seconds for WebSocket data
  });

  const { data: signalHistory, refetch: refetchHistory } = useQuery({
    queryKey: ["/api/signals/history"],
    queryFn: () => api.signals.getHistory(5),
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const { data: topHedgePairs } = useQuery({
    queryKey: ["/api/signals/top-hedge-pairs"],
    queryFn: async () => {
      const response = await fetch('/api/signals/top-hedge-pairs');
      if (!response.ok) throw new Error('Failed to fetch top hedge pairs');
      return response.json() as Promise<{ pairs: TopHedgePair[]; asOf: string }>;
    },
    refetchInterval: 15000, // Refetch every 15 seconds
  });

  // WebSocket for real-time updates
  const { isConnected, latency } = useWebSocket({
    onMessage: (message: WSMessage) => {
      setLastUpdate(new Date().toLocaleTimeString('en-US', { hour12: false }));
      
      switch (message.type) {
        case 'signal_update':
          refetchSignal();
          break;
        case 'price_update':
          refetchPrices();
          break;
        case 'system_update':
          refetchStatus();
          break;
        case 'initial_data':
          // Refresh all data when receiving initial data
          refetchSignal();
          refetchPrices();
          refetchStatus();
          refetchHistory();
          break;
      }
    },
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="surface border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <TrendingUp className="text-primary text-2xl h-8 w-8" />
                <div>
                  <h1 className="text-xl font-bold" data-testid="app-title">Hyperliquid Pairs Trading</h1>
                  <p className="text-sm text-secondary">Statistical Divergence Signals</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <MetricsInfoDropdown />
              <ConnectionStatus isConnected={isConnected} />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Current Top Hedge Pairs */}
        <div>
          <h2 className="text-lg font-bold mb-4 text-gray-300">Current Top Hedge Pairs</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topHedgePairs?.pairs?.map((pair, index) => {
              const formatPairName = (pairA: string, pairB: string) => {
                const cleanA = pairA.replace('-USD-PERP', '');
                const cleanB = pairB.replace('-USD-PERP', '');
                return `${cleanA}/${cleanB}`;
              };

              const sideA = pair.signalType === 'SHORT_SPREAD' ? 'LONG' : 'SHORT';
              const sideB = pair.signalType === 'SHORT_SPREAD' ? 'SHORT' : 'LONG';
              
              return (
                <div key={index} className="surface rounded-lg p-4 border border-gray-700" data-testid={`hedge-pair-${pair.period}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-300">
                      {sideA} {formatPairName(pair.pairA, pair.pairB)} | {sideB} {formatPairName(pair.pairA, pair.pairB)}
                    </span>
                    <span className="text-xs text-gray-500">{pair.period}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className={`text-xs ${sideA === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                        {sideA} {pair.pairA.replace('-USD-PERP', '')}
                      </span>
                      <span className={`text-xs ${sideB === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                        {sideB} {pair.pairB.replace('-USD-PERP', '')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-xs">Z-Score: {pair.zScore.toFixed(2)}</span>
                      <span className="text-gray-400 text-xs">Confidence: {(pair.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-xs">Hedge: {pair.hedgeRatio.toFixed(3)}</span>
                      <span className="text-gray-400 text-xs">{new Date(pair.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              );
            }) || (
              // Fallback content when no data available
              Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="surface rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-400">Loading...</span>
                    <span className="text-xs text-gray-500">{index === 0 ? '24h' : index === 1 ? '12h' : '6h'}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500 text-xs">Analyzing pairs...</span>
                      <span className="text-gray-500 text-xs">Please wait</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Best Long/Short Signal */}
        <SignalCard bestSignal={bestSignal} />

        {/* Cross-Exchange Funding Rate Analysis */}
        <FundingRateChart />

        {/* Recent Signals */}
        <SignalHistory signals={signalHistory || []} />
      </main>

      {/* WebSocket Indicator */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="surface border border-gray-700 rounded-lg px-4 py-3 shadow-2xl flex items-center space-x-3">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-error'}`}></div>
          <span className="text-sm font-medium">Live Data Stream</span>
          <span className="text-xs text-secondary" data-testid="ws-latency">
            {latency ? `~${(latency / 1000).toFixed(1)}s` : '~0.8s'}
          </span>
        </div>
      </div>
    </div>
  );
}
