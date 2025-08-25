import { Badge } from "@/components/ui/badge";

interface ConnectionStatusProps {
  isConnected: boolean;
}

export default function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <div className="flex items-center space-x-2 surface-light px-3 py-2 rounded-lg">
      <div 
        className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-success animate-pulse' : 'bg-error'
        }`}
        data-testid="connection-indicator"
      />
      <span className="text-sm" data-testid="connection-status">
        {isConnected ? 'Live' : 'Disconnected'}
      </span>
    </div>
  );
}
