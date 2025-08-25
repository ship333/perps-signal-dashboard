import WebSocket from 'ws';
import { storage } from './storage';
import { type WSMessage } from '@shared/schema';

interface HyperliquidPrice {
  coin: string;
  px: string;
  sz: string;
  time: number;
}

interface HyperliquidMessage {
  channel: string;
  data: HyperliquidPrice[];
}

interface HyperliquidMeta {
  universe: Array<{
    name: string;
    szDecimals: number;
  }>;
}

interface HyperliquidAllMids {
  [key: string]: string; // coin name -> mid price
}

export class HyperliquidClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private onPriceUpdate?: (prices: any[]) => void;
  private symbols: string[] = ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP'];

  constructor(onPriceUpdate?: (prices: any[]) => void) {
    this.onPriceUpdate = onPriceUpdate;
  }

  async connect() {
    console.log('Starting Hyperliquid price data client...');
    
    // Start with HTTP API polling since WebSocket subscription isn't working
    await this.startHttpPolling();
    
    // Also try WebSocket connection in parallel (for future use)
    this.tryWebSocketConnection();
  }

  private async startHttpPolling() {
    console.log('Starting HTTP polling for Hyperliquid prices...');
    
    // Get initial prices
    await this.fetchPricesViaHttp();
    
    // Set up regular polling every 3 seconds
    this.pollTimer = setInterval(async () => {
      try {
        await this.fetchPricesViaHttp();
      } catch (error) {
        console.error('Error in price polling:', error);
      }
    }, 3000);
  }

  private async fetchPricesViaHttp() {
    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'allMids'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Received Hyperliquid HTTP response:', JSON.stringify(data).substring(0, 300) + '...');
      
      await this.processHttpPriceData(data);
      
    } catch (error) {
      console.error('Error fetching prices via HTTP:', error);
    }
  }

  private async processHttpPriceData(data: any) {
    try {
      const prices = [];
      
      // Hyperliquid allMids returns an object with coin -> mid price
      if (data && typeof data === 'object') {
        for (const [coin, midPrice] of Object.entries(data)) {
          const symbol = this.normalizeSymbol(coin);
          const price = parseFloat(midPrice as string);
          
          if (symbol && !isNaN(price) && price > 0) {
            const priceData = {
              symbol,
              price,
              change24h: 0, // We'll get this from a separate call if needed
              source: 'hyperliquid',
            };
            
            await storage.createPrice(priceData);
            prices.push(priceData);
          }
        }
      }
      
      if (prices.length > 0) {
        console.log(`Updated ${prices.length} prices from Hyperliquid HTTP API:`, 
          prices.map(p => `${p.symbol}=$${p.price.toFixed(2)}`).join(', '));
        
        // Notify callback if provided
        if (this.onPriceUpdate) {
          this.onPriceUpdate(prices);
        }
        
        // Mark as connected since we're getting data
        this.isConnected = true;
      } else {
        console.log('No valid prices extracted from HTTP response');
      }
    } catch (error) {
      console.error('Error processing HTTP price data:', error);
    }
  }

  private tryWebSocketConnection() {
    // Keep the WebSocket attempt for potential future use
    try {
      console.log('Also attempting WebSocket connection...');
      this.ws = new WebSocket('wss://hyperliquid-mainnet.g.alchemy.com/v2/cvp9WtyKIP7o-U2OHkEEE');

      this.ws.on('open', () => {
        console.log('WebSocket connected, but using HTTP polling for reliability');
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          // Log but don't process - we're using HTTP for now
          console.log('WebSocket message received (not processed):', JSON.stringify(message).substring(0, 200) + '...');
        } catch (error) {
          // Ignore WebSocket errors for now
        }
      });

      this.ws.on('close', () => {
        console.log('WebSocket connection closed (HTTP polling continues)');
      });

      this.ws.on('error', (error) => {
        console.log('WebSocket error (HTTP polling continues):', error.message);
      });

    } catch (error) {
      console.log('WebSocket connection failed (HTTP polling continues):', error);
    }
  }

  private handleMessage(message: any) {
    try {
      console.log('Processing message type:', typeof message, 'keys:', Object.keys(message || {}));
      
      // Handle different message types from Hyperliquid
      if (message.channel === 'allMids' && message.data) {
        console.log('Processing allMids channel data');
        this.processPriceUpdates(message.data);
      } else if (message.data && Array.isArray(message.data.mids)) {
        console.log('Processing mids array from data');
        this.processPriceUpdates(message.data.mids);
      } else if (message.data && typeof message.data === 'object') {
        console.log('Processing object data format');
        const mids = message.data.mids || message.data;
        if (Array.isArray(mids)) {
          this.processPriceUpdates(mids);
        }
      } else if (Array.isArray(message)) {
        console.log('Processing array message format');
        this.processPriceUpdates(message);
      } else if (message.result && Array.isArray(message.result)) {
        console.log('Processing result array format');
        this.processPriceUpdates(message.result);
      } else {
        console.log('Unknown message format, attempting to extract price data');
        // Try to find any price-like data in the message
        if (message.data) {
          this.processPriceUpdates([message.data]);
        } else {
          this.processPriceUpdates([message]);
        }
      }
    } catch (error) {
      console.error('Error handling Hyperliquid message:', error);
    }
  }

  private async processPriceUpdates(priceData: any[]) {
    try {
      console.log('Processing price data array of length:', priceData?.length);
      const prices = [];
      const now = new Date();

      if (!Array.isArray(priceData)) {
        console.log('Price data is not an array, converting:', typeof priceData);
        priceData = [priceData];
      }

      for (const item of priceData) {
        console.log('Processing item:', JSON.stringify(item).substring(0, 200));
        
        // Handle different possible data formats from Hyperliquid
        const symbol = this.normalizeSymbol(
          item.coin || item.symbol || item.asset || item.name || item.market
        );
        const price = parseFloat(
          item.px || item.price || item.mid || item.markPrice || item.lastPrice || item.close
        );
        
        console.log(`Extracted - Symbol: ${symbol}, Price: ${price}`);
        
        if (symbol && !isNaN(price) && price > 0) {
          const priceData = {
            symbol,
            price,
            change24h: parseFloat(item.change24h || item.priceChange24h || item.changePercent || 0),
            source: 'hyperliquid',
          };
          
          await storage.createPrice(priceData);
          prices.push(priceData);
          console.log(`Stored price: ${symbol} = $${price}`);
        } else {
          console.log(`Skipped invalid price data - Symbol: ${symbol}, Price: ${price}`);
        }
      }

      if (prices.length > 0) {
        console.log(`Successfully updated ${prices.length} prices from Hyperliquid:`, prices.map(p => `${p.symbol}=$${p.price}`));
        // Notify callback if provided
        if (this.onPriceUpdate) {
          this.onPriceUpdate(prices);
        }
      } else {
        console.log('No valid prices extracted from data');
      }
    } catch (error) {
      console.error('Error processing Hyperliquid price updates:', error);
    }
  }

  private normalizeSymbol(symbol: string): string {
    if (!symbol) return '';
    
    // Convert Hyperliquid symbols to our format
    const symbolMap: { [key: string]: string } = {
      'BTC': 'BTC-USD-PERP',
      'ETH': 'ETH-USD-PERP', 
      'SOL': 'SOL-USD-PERP',
      'AVAX': 'AVAX-USD-PERP',
      'ARB': 'ARB-USD-PERP',
      'OP': 'OP-USD-PERP',
      'BTCUSD': 'BTC-USD-PERP',
      'ETHUSD': 'ETH-USD-PERP',
      'SOLUSD': 'SOL-USD-PERP',
      'AVAXUSD': 'AVAX-USD-PERP',
      'ARBUSD': 'ARB-USD-PERP',
      'OPUSD': 'OP-USD-PERP',
    };

    // Remove any suffixes and normalize
    const cleanSymbol = symbol.replace(/[-_\s].*$/, '').toUpperCase();
    const withoutPerp = cleanSymbol.replace(/PERP$/, '').replace(/USD$/, '');
    
    return symbolMap[cleanSymbol] || symbolMap[withoutPerp] || `${withoutPerp}-USD-PERP`;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect to Hyperliquid...');
      this.connect();
    }, 5000); // Reconnect after 5 seconds
  }

  public isConnectedToHyperliquid(): boolean {
    return this.isConnected;
  }

  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    console.log('Hyperliquid client disconnected');
  }
}