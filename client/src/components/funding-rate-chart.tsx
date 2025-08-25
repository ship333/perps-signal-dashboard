import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, Info } from "lucide-react";

interface FundingRateData {
  coin: string;
  bestLong: {
    exchange: string;
    medianFunding: number;
    reason: string;
  };
  bestShort: {
    exchange: string;
    medianFunding: number;
    reason: string;
  };
  summary: string;
}

interface FundingRateAnalysis {
  lastUpdated: string;
  data: Record<string, FundingRateData>;
}

interface TableData {
  coin: string;
  bestLongExchange: string;
  bestShortExchange: string;
}

interface FundingRateTable {
  lastUpdated: string;
  tableData: TableData[];
}

export default function FundingRateChart() {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const { data: analysisData, isLoading: analysisLoading } = useQuery<FundingRateAnalysis>({
    queryKey: ['/api/funding-rates/analysis'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const { data: tableData, isLoading: tableLoading } = useQuery<FundingRateTable>({
    queryKey: ['/api/funding-rates/table'],
    refetchInterval: 300000, // Refresh every 5 minutes
  });

  const coins = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'HYPE', 'TRX', 'LINK'];

  const getExchangeColor = (exchange: string) => {
    switch (exchange.toLowerCase()) {
      case 'binance':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'bybit':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'okx':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'hyperliquid':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getFundingColor = (funding: number) => {
    if (funding < 0) return 'text-green-400';
    if (funding > 0.005) return 'text-red-400';
    return 'text-gray-300';
  };

  if (analysisLoading || tableLoading) {
    return (
      <div className="surface rounded-lg p-6 border border-gray-700 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Cross-Exchange Funding Rate Analysis</h2>
          <div className="animate-pulse bg-gray-600 h-4 w-20 rounded"></div>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="animate-pulse bg-gray-700 h-16 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="surface rounded-lg p-6 border border-gray-700 mb-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-white">Cross-Exchange Funding Rate Analysis</h2>
          <div className="flex items-center space-x-2 text-sm text-gray-400">
            <Info className="h-4 w-4" />
            <span>Optimal exchanges for long/short positions based on 30-day median funding rates</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('chart')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'chart' 
                  ? 'bg-primary text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
              data-testid="chart-view-button"
            >
              Chart
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                viewMode === 'table' 
                  ? 'bg-primary text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
              data-testid="table-view-button"
            >
              Table
            </button>
          </div>
          
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
            data-testid="collapse-toggle"
          >
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {viewMode === 'chart' && analysisData && (
            <div className="space-y-4">
              {coins.map((coin) => {
                const coinData = analysisData.data[coin];
                if (!coinData) return null;

                return (
                  <div 
                    key={coin} 
                    className="bg-gray-800/50 border border-gray-600 rounded-lg p-4"
                    data-testid={`funding-chart-${coin.toLowerCase()}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-semibold text-white">{coin}</h3>
                      <div className="text-xs text-gray-400">
                        Last updated: {new Date(analysisData.lastUpdated).toLocaleTimeString()}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Long Position */}
                      <div className="bg-gray-700/30 rounded-lg p-4 border-l-4 border-green-500">
                        <div className="flex items-center space-x-2 mb-2">
                          <TrendingUp className="h-5 w-5 text-green-400" />
                          <span className="font-medium text-green-400">Best Long Position</span>
                        </div>
                        <div className="space-y-2">
                          <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${getExchangeColor(coinData.bestLong.exchange)}`}>
                            {coinData.bestLong.exchange}
                          </div>
                          <p className="text-sm text-gray-300">{coinData.bestLong.reason}</p>
                          <div className="text-xs text-gray-400">
                            Median Rate: <span className={getFundingColor(coinData.bestLong.medianFunding)}>
                              {(coinData.bestLong.medianFunding * 100).toFixed(3)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Short Position */}
                      <div className="bg-gray-700/30 rounded-lg p-4 border-l-4 border-red-500">
                        <div className="flex items-center space-x-2 mb-2">
                          <TrendingDown className="h-5 w-5 text-red-400" />
                          <span className="font-medium text-red-400">Best Short Position</span>
                        </div>
                        <div className="space-y-2">
                          <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${getExchangeColor(coinData.bestShort.exchange)}`}>
                            {coinData.bestShort.exchange}
                          </div>
                          <p className="text-sm text-gray-300">{coinData.bestShort.reason}</p>
                          <div className="text-xs text-gray-400">
                            Median Rate: <span className={getFundingColor(coinData.bestShort.medianFunding)}>
                              {(coinData.bestShort.medianFunding * 100).toFixed(3)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === 'table' && tableData && (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="funding-table">
                <thead>
                  <tr className="border-b border-gray-600">
                    <th className="text-left py-3 px-4 font-semibold text-white">Coin</th>
                    <th className="text-left py-3 px-4 font-semibold text-white">Best Long Exchange</th>
                    <th className="text-left py-3 px-4 font-semibold text-white">Best Short Exchange</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData?.tableData?.map((row, index) => (
                    <tr 
                      key={row.coin} 
                      className={`border-b border-gray-700 ${index % 2 === 0 ? 'bg-gray-800/30' : ''}`}
                      data-testid={`funding-table-row-${row.coin.toLowerCase()}`}
                    >
                      <td className="py-3 px-4 font-medium text-white">{row.coin}</td>
                      <td className={`py-3 px-4 text-sm ${row.bestLongExchange.includes('Hyperliquid') ? 'text-green-400 font-medium' : 'text-gray-300'}`}>{row.bestLongExchange}</td>
                      <td className={`py-3 px-4 text-sm ${row.bestShortExchange.includes('Hyperliquid') ? 'text-green-400 font-medium' : 'text-gray-300'}`}>{row.bestShortExchange}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-xs text-gray-400 text-center">
                Last updated: {new Date(tableData.lastUpdated).toLocaleString()}
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-600">
            <div className="flex items-center justify-between text-sm text-gray-400">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                  <span>Binance</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-orange-500 rounded"></div>
                  <span>Bybit</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span>OKX</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-purple-500 rounded"></div>
                  <span>Hyperliquid</span>
                </div>
              </div>
              <div className="text-xs">
                Analysis based on 24-hour historical funding rate medians from 4 major exchanges
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}