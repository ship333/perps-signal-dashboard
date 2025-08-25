import { Card, CardContent } from "@/components/ui/card";
import { Satellite, Link, Plug, Heart } from "lucide-react";
import { type SystemStatus } from "@shared/schema";

interface SystemStatusProps {
  systemStatus?: SystemStatus;
  isConnected: boolean;
  connectionCount: number;
}

export default function SystemStatusComponent({ 
  systemStatus, 
  isConnected,
  connectionCount 
}: SystemStatusProps) {
  const freshness = systemStatus?.dataFreshness || 1;
  const activePairs = systemStatus?.activePairs || 8;
  const status = systemStatus?.status || 'healthy';

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <Card className="surface border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-secondary text-sm">Data Freshness</p>
              <p 
                className="text-2xl font-bold text-success" 
                data-testid="data-freshness"
              >
                {freshness}s
              </p>
            </div>
            <Satellite className="text-success text-2xl h-8 w-8" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="surface border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-secondary text-sm">Active Pairs</p>
              <p 
                className="text-2xl font-bold" 
                data-testid="active-pairs"
              >
                {activePairs}
              </p>
            </div>
            <Link className="text-primary text-2xl h-8 w-8" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="surface border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-secondary text-sm">WebSocket</p>
              <p 
                className="text-2xl font-bold text-success" 
                data-testid="websocket-connections"
              >
                {connectionCount}
              </p>
            </div>
            <Plug className="text-success text-2xl h-8 w-8" />
          </div>
        </CardContent>
      </Card>
      
      <Card className="surface border-gray-700">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-secondary text-sm">System</p>
              <p 
                className="text-2xl font-bold text-success" 
                data-testid="system-status"
              >
                {status === 'healthy' ? 'Healthy' : 'Warning'}
              </p>
            </div>
            <Heart className="text-success text-2xl h-8 w-8" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
