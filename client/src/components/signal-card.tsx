import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, ArrowUp, ArrowDown, Info, ChevronDown } from "lucide-react";
import { type BestSignalResponse } from "@shared/schema";
import SpreadChart from "./spread-chart";
import CorrelationChart from "./correlation-chart";
import { useState } from "react";

interface SignalCardProps {
  bestSignal?: BestSignalResponse;
}

export default function SignalCard({ bestSignal }: SignalCardProps) {
  const [showSpreadInfo, setShowSpreadInfo] = useState(false);
  const [showCorrelationInfo, setShowCorrelationInfo] = useState(false);

  if (!bestSignal) {
    return (
      <Card className="surface border-gray-700 mb-8">
        <CardContent className="p-8">
          <div className="text-center text-secondary">
            <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No signals available</p>
            <p className="text-sm">Waiting for market data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { 
    pair = { a: '', b: '' }, 
    sides = { a: '', b: '' }, 
    metrics = { hedgeRatio: 0, zScore: 0, confidence: 0, edgeBps: 0, pctChange24h: 0, pctChange6h: 0, pctChange1h: 0 }, 
    charts = { a: [], b: [] }, 
    quoteMeta = { a: { source: '', ageMs: 0 }, b: { source: '', ageMs: 0 } }
  } = bestSignal;

  return (
    <Card className="surface border-gray-700 shadow-2xl mb-8">
      <CardHeader className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Trophy className="text-accent text-2xl h-8 w-8" />
            <div>
              <h2 className="text-2xl font-bold" data-testid="signal-title">Best Signal Right Now</h2>
              <p className="text-secondary">Highest confidence statistical arbitrage opportunity</p>
            </div>
          </div>
          <Badge className="bg-success/10 text-success border-success/20">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse mr-2"></div>
            Active Signal
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-8 pt-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Pair Information */}
          <div className="lg:col-span-1">
            <div className="space-y-6">
              {/* Pair Assets */}
              <Card className="surface-light border-gray-600">
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Trading Pair</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-success/10 rounded-lg border-l-4 border-success">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-success/20 rounded-full flex items-center justify-center">
                          <ArrowUp className="text-success h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold text-lg" data-testid="pair-a-symbol">{pair.a || 'N/A'}</p>
                          <p className="text-success font-medium">{sides.a || 'N/A'} Position</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold" data-testid="pair-a-price">
                          ${bestSignal.currentPrices?.a?.toLocaleString() || charts.a?.[charts.a.length - 1]?.p?.toLocaleString() || '0'}
                        </p>
                        <p className="text-success text-sm" data-testid="pair-a-change">
                          {(bestSignal.pairChanges?.a?.change24h || metrics.pctChange24h) > 0 ? '+' : ''}{(bestSignal.pairChanges?.a?.change24h || metrics.pctChange24h)?.toFixed(2) || '0'}%
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-error/10 rounded-lg border-l-4 border-error">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-error/20 rounded-full flex items-center justify-center">
                          <ArrowDown className="text-error h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold text-lg" data-testid="pair-b-symbol">{pair.b || 'N/A'}</p>
                          <p className="text-error font-medium">{sides.b || 'N/A'} Position</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold" data-testid="pair-b-price">
                          ${bestSignal.currentPrices?.b?.toLocaleString() || charts.b?.[charts.b.length - 1]?.p?.toLocaleString() || '0'}
                        </p>
                        <p className="text-error text-sm" data-testid="pair-b-change">
                          {(bestSignal.pairChanges?.b?.change24h || metrics.pctChange24h * -0.5) > 0 ? '+' : ''}{(bestSignal.pairChanges?.b?.change24h || metrics.pctChange24h * -0.5)?.toFixed(2) || '0'}%
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Signal Metrics */}
              <Card className="surface-light border-gray-600">
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Signal Metrics</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-secondary">Hedge Ratio (β)</span>
                      <span className="font-bold text-white" data-testid="hedge-ratio">
                        {metrics.hedgeRatio?.toFixed(3) || '0.000'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Z-Score</span>
                      <span className="font-bold text-white" data-testid="z-score">
                        {metrics.zScore?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Confidence</span>
                      <span className="font-bold text-white" data-testid="confidence">
                        {((metrics.confidence || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-secondary">Expected Edge</span>
                      <span className="font-bold text-white" data-testid="expected-edge">
                        +{(metrics.edgeBps || 0).toFixed(0)} bps
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Charts Column */}
          <div className="lg:col-span-2">
            <Card className="surface-light border-gray-600 h-full">
              <CardContent className="p-6 h-full flex flex-col">
                {/* Combined Charts Container */}
                <div className="flex-1 flex flex-col space-y-4">
                  {/* Spread Analysis */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">15-Minute Spread Analysis</h3>
                      <div className="relative">
                        <button
                          className="p-1 rounded hover:bg-gray-700 transition-colors"
                          onClick={() => setShowSpreadInfo(!showSpreadInfo)}
                          data-testid="spread-info-toggle"
                        >
                          <Info className="h-4 w-4 text-gray-400 hover:text-white" />
                        </button>
                        {showSpreadInfo && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setShowSpreadInfo(false)}
                            />
                            <div className="absolute right-0 top-full mt-2 w-80 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 p-4">
                              <h4 className="font-semibold text-white mb-2">Spread Analysis Explained</h4>
                              <div className="space-y-2 text-sm text-gray-300">
                                <p><strong>Purpose:</strong> Tracks the price difference between two correlated assets over 15-minute intervals to identify mean reversion opportunities.</p>
                                <p><strong>Z-Score Line:</strong> Shows how many standard deviations the current spread deviates from its historical mean. Values above +2 or below -2 indicate potential trading signals.</p>
                                <p><strong>Entry Threshold (Green):</strong> The statistical threshold where mean reversion probability becomes favorable for opening positions.</p>
                                <p><strong>Exit Threshold (Red):</strong> The level where profit-taking becomes optimal as the spread returns toward its mean.</p>
                                <p><strong>What to Look For:</strong> Sharp deviations from the mean that cross thresholds, indicating temporary pricing inefficiencies between related assets.</p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="relative h-56">
                      <SpreadChart 
                        data={charts.a}
                        zScore={metrics.zScore}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-4 text-sm text-secondary">
                      <span>Last 15 minutes</span>
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 bg-accent rounded-full"></div>
                          <span>Spread Z-Score</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 bg-success rounded-full"></div>
                          <span>Entry Threshold</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 bg-error rounded-full"></div>
                          <span>Exit Threshold</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Divider */}
                  <div className="border-t border-gray-600"></div>
                  
                  {/* Correlation Analysis */}
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-lg font-semibold">Correlation Analysis</h3>
                        <div className="relative">
                          <button
                            className="p-1 rounded hover:bg-gray-700 transition-colors"
                            onClick={() => setShowCorrelationInfo(!showCorrelationInfo)}
                            data-testid="correlation-info-toggle"
                          >
                            <Info className="h-4 w-4 text-gray-400 hover:text-white" />
                          </button>
                          {showCorrelationInfo && (
                            <>
                              <div 
                                className="fixed inset-0 z-10" 
                                onClick={() => setShowCorrelationInfo(false)}
                              />
                              <div className="absolute left-0 top-full mt-2 w-80 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 p-4">
                                <h4 className="font-semibold text-white mb-2">Correlation Analysis Explained</h4>
                                <div className="space-y-2 text-sm text-gray-300">
                                  <p><strong>Purpose:</strong> Measures the statistical relationship strength between two assets over time to validate pairs trading opportunities.</p>
                                  <p><strong>Correlation Range:</strong> Values from 0% (no relationship) to 100% (perfect correlation). Higher values indicate more reliable arbitrage signals.</p>
                                  <p><strong>Optimal Range:</strong> 70-95% correlation provides the best risk-adjusted returns. Below 60% increases risk, above 95% reduces profit potential.</p>
                                  <p><strong>Volume Indicators:</strong> Trading volume overlay shows market liquidity during correlation periods, affecting execution feasibility.</p>
                                  <p><strong>What to Look For:</strong> Consistent correlation above 70% with sufficient volume, indicating stable statistical relationships for pairs trading.</p>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-secondary">Current Correlation</p>
                        <p className="text-lg font-bold text-white" data-testid="correlation-value">
                          {(metrics.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                    <div className="relative h-56">
                      <CorrelationChart 
                        data={charts.a}
                        correlation={metrics.confidence}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-4 text-sm text-secondary">
                      <span>Last 30 minutes</span>
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-3 bg-success rounded-full"></div>
                          <span>Correlation</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="w-3 h-1 bg-purple-500 rounded"></div>
                          <span>Volume</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Risk & Economics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-8">
          <Card className="surface-light border-gray-600">
            <CardContent className="p-4 text-center">
              <p className="text-secondary text-sm">Fees (bps)</p>
              <p className="text-xl font-bold text-white" data-testid="fees">-8.5</p>
            </CardContent>
          </Card>
          <Card className="surface-light border-gray-600">
            <CardContent className="p-4 text-center">
              <p className="text-secondary text-sm">Funding (bps/h)</p>
              <p className="text-xl font-bold text-white" data-testid="funding">-2.1</p>
            </CardContent>
          </Card>
          <Card className="surface-light border-gray-600">
            <CardContent className="p-4 text-center">
              <p className="text-secondary text-sm">Slippage (bps)</p>
              <p className="text-xl font-bold text-white" data-testid="slippage">-3.2</p>
            </CardContent>
          </Card>
          <Card className="surface-light border-gray-600">
            <CardContent className="p-4 text-center">
              <p className="text-secondary text-sm">Net Edge (bps)</p>
              <p className="text-xl font-bold text-white" data-testid="net-edge">+113.2</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
