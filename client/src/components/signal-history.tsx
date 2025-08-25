import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";
import { type Signal } from "@shared/schema";

interface SignalHistoryProps {
  signals: Signal[];
}

export default function SignalHistory({ signals }: SignalHistoryProps) {
  const formatTimeAgo = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getSignalColor = (zScore: number) => {
    if (Math.abs(zScore) >= 2.5) return 'success';
    if (Math.abs(zScore) >= 2.0) return 'accent';
    return 'gray-600';
  };

  const getPositionBadgeColor = (signalType: string) => {
    return signalType === 'SHORT_SPREAD' ? 'success' : 'error';
  };

  return (
    <Card className="surface border-gray-700">
      <CardHeader className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Signal History</h3>
          <Button variant="ghost" size="sm" className="text-primary hover:text-blue-400">
            View All
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-6 pt-0">
        <div className="space-y-4">
          {signals.length === 0 ? (
            <div className="text-center text-secondary py-8">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No signal history available</p>
            </div>
          ) : (
            signals.map((signal) => {
              const borderColor = getSignalColor(signal.zScore);
              const badgeColor = getPositionBadgeColor(signal.signalType);
              const isActive = signal.isActive;
              
              return (
                <div 
                  key={signal.id}
                  className={`border-l-4 p-4 rounded-lg ${
                    isActive 
                      ? `border-${borderColor} bg-${borderColor}/5`
                      : 'border-gray-600 bg-gray-600/5'
                  }`}
                  data-testid={`signal-item-${signal.id}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold" data-testid={`signal-pair-${signal.id}`}>
                        {signal.pairA}/{signal.pairB}
                      </span>
                      <Badge 
                        variant="secondary"
                        className={`${
                          isActive
                            ? badgeColor === 'success' 
                              ? 'bg-success/20 text-success' 
                              : 'bg-error/20 text-error'
                            : 'bg-gray-600/20 text-gray-400'
                        } text-xs`}
                      >
                        {isActive 
                          ? signal.signalType === 'SHORT_SPREAD' ? 'LONG/SHORT' : 'SHORT/LONG'
                          : 'EXPIRED'
                        }
                      </Badge>
                    </div>
                    <span className="text-sm text-secondary" data-testid={`signal-time-${signal.id}`}>
                      {formatTimeAgo(signal.createdAt!)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>
                      Z-Score: <span className="font-bold" data-testid={`signal-zscore-${signal.id}`}>
                        {signal.zScore.toFixed(2)}
                      </span>
                    </span>
                    <span>
                      Edge: <span 
                        className={`font-bold ${
                          isActive ? 'text-success' : 'text-gray-400'
                        }`}
                        data-testid={`signal-edge-${signal.id}`}
                      >
                        +{signal.expectedEdge.toFixed(0)} bps
                      </span>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
