import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RefreshCw, Coins } from "lucide-react";
import { type Price } from "@shared/schema";

interface LivePricesProps {
  prices: Price[];
}

export default function LivePrices({ prices }: LivePricesProps) {
  return (
    <Card className="surface border-gray-700">
      <CardHeader className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">Live Market Prices</h3>
          <div className="flex items-center space-x-2 text-sm text-secondary">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Auto-updating</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-6 pt-0">
        <div className="space-y-3">
          {prices.length === 0 ? (
            <div className="text-center text-secondary py-8">
              <Coins className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No price data available</p>
            </div>
          ) : (
            prices.map((price) => (
              <div 
                key={price.id}
                className="flex items-center justify-between p-4 surface-light rounded-lg hover:bg-gray-700 transition-colors"
                data-testid={`price-item-${price.symbol}`}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                    <Coins className="text-primary h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold" data-testid={`symbol-${price.symbol}`}>
                      {price.symbol}
                    </p>
                    <p className="text-sm text-secondary capitalize">
                      {price.source}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold" data-testid={`price-${price.symbol}`}>
                    ${price.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p 
                    className={`text-sm ${
                      (price.change24h || 0) >= 0 ? 'text-success' : 'text-error'
                    }`}
                    data-testid={`change-${price.symbol}`}
                  >
                    {(price.change24h || 0) >= 0 ? '+' : ''}{(price.change24h || 0).toFixed(2)}% (24h)
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
