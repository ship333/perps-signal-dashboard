#!/usr/bin/env python3
"""
Funding Rate Analyzer for Top Cryptocurrencies
Fetches historical funding rates from multiple exchanges and analyzes optimal long/short positions
"""

import asyncio
import aiohttp
import pandas as pd
import numpy as np
import json
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import matplotlib.pyplot as plt
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots

# Configuration
COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'HYPE', 'TRX', 'LINK']
EXCHANGES = {
    'binance': {
        'name': 'Binance',
        'url': 'https://fapi.binance.com/fapi/v1/fundingRate',
        'params': lambda symbol: {'symbol': f'{symbol}USDT', 'limit': 500},
        'symbol_format': lambda coin: f'{coin}USDT'
    },
    'bybit': {
        'name': 'Bybit',
        'url': 'https://api.bybit.com/v5/market/funding/history',
        'params': lambda symbol: {'category': 'linear', 'symbol': f'{symbol}USDT', 'limit': 200},
        'symbol_format': lambda coin: f'{coin}USDT'
    },
    'okx': {
        'name': 'OKX',
        'url': 'https://www.okx.com/api/v5/public/funding-rate-history',
        'params': lambda symbol: {'instId': f'{symbol}-USDT-SWAP', 'limit': 100},
        'symbol_format': lambda coin: f'{coin}-USDT-SWAP'
    },
    'hyperliquid': {
        'name': 'Hyperliquid',
        'url': 'https://api.hyperliquid.xyz/info',
        'params': lambda symbol: {'type': 'fundingHistory', 'coin': symbol},
        'symbol_format': lambda coin: coin
    }
}

class FundingRateAnalyzer:
    def __init__(self):
        self.session = None
        self.data = {}
        self.analysis_results = {}
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def fetch_binance_funding(self, coin: str) -> List[Dict]:
        """Fetch funding rate data from Binance"""
        try:
            url = EXCHANGES['binance']['url']
            params = EXCHANGES['binance']['params'](coin)
            
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    # Binance returns funding rate as decimal (e.g., 0.0001 = 0.01%)
                    return [{
                        'timestamp': item['fundingTime'],
                        'funding_rate': float(item['fundingRate']) * 100,  # Convert to percentage
                        'exchange': 'binance'
                    } for item in data]
                else:
                    print(f"Binance API error for {coin}: {response.status}")
                    return []
        except Exception as e:
            print(f"Error fetching Binance data for {coin}: {e}")
            return []
    
    async def fetch_bybit_funding(self, coin: str) -> List[Dict]:
        """Fetch funding rate data from Bybit"""
        try:
            url = EXCHANGES['bybit']['url']
            params = EXCHANGES['bybit']['params'](coin)
            
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get('retCode') == 0 and 'result' in data:
                        # Bybit returns funding rate as percentage string
                        return [{
                            'timestamp': int(item['fundingRateTimestamp']),
                            'funding_rate': float(item['fundingRate']) * 100,  # Convert to percentage
                            'exchange': 'bybit'
                        } for item in data['result']['list']]
                    else:
                        print(f"Bybit API error for {coin}: {data}")
                        return []
                else:
                    print(f"Bybit API error for {coin}: {response.status}")
                    return []
        except Exception as e:
            print(f"Error fetching Bybit data for {coin}: {e}")
            return []
    
    async def fetch_okx_funding(self, coin: str) -> List[Dict]:
        """Fetch funding rate data from OKX"""
        try:
            url = EXCHANGES['okx']['url']
            params = EXCHANGES['okx']['params'](coin)
            
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get('code') == '0' and 'data' in data:
                        # OKX returns funding rate as decimal
                        return [{
                            'timestamp': int(item['fundingTime']),
                            'funding_rate': float(item['realizedRate']) * 100,  # Convert to percentage
                            'exchange': 'okx'
                        } for item in data['data']]
                    else:
                        print(f"OKX API error for {coin}: {data}")
                        return []
                else:
                    print(f"OKX API error for {coin}: {response.status}")
                    return []
        except Exception as e:
            print(f"Error fetching OKX data for {coin}: {e}")
            return []
    
    async def fetch_hyperliquid_funding(self, coin: str) -> List[Dict]:
        """Fetch funding rate data from Hyperliquid"""
        try:
            url = EXCHANGES['hyperliquid']['url']
            params = EXCHANGES['hyperliquid']['params'](coin)
            
            async with self.session.post(url, json=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if isinstance(data, list):
                        # Hyperliquid returns funding rate history as array
                        return [{
                            'timestamp': int(item.get('time', 0)),
                            'funding_rate': float(item.get('fundingRate', 0)) * 100,  # Convert to percentage
                            'exchange': 'hyperliquid'
                        } for item in data if 'fundingRate' in item]
                    else:
                        print(f"Hyperliquid API error for {coin}: unexpected format")
                        return []
                else:
                    print(f"Hyperliquid API error for {coin}: {response.status}")
                    return []
        except Exception as e:
            print(f"Error fetching Hyperliquid data for {coin}: {e}")
            return []

    async def fetch_all_funding_data(self) -> Dict:
        """Fetch funding rate data for all coins from all exchanges"""
        tasks = []
        
        for coin in COINS:
            tasks.extend([
                self.fetch_binance_funding(coin),
                self.fetch_bybit_funding(coin),
                self.fetch_okx_funding(coin),
                self.fetch_hyperliquid_funding(coin)
            ])
        
        print("Fetching funding rate data from all exchanges...")
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Organize results by coin and exchange
        data = {}
        result_index = 0
        
        for coin in COINS:
            data[coin] = {}
            for exchange in ['binance', 'bybit', 'okx', 'hyperliquid']:
                result = results[result_index]
                if isinstance(result, list):
                    data[coin][exchange] = result
                else:
                    print(f"Error for {coin} on {exchange}: {result}")
                    data[coin][exchange] = []
                result_index += 1
        
        self.data = data
        return data
    
    def analyze_funding_rates(self) -> Dict:
        """Analyze funding rates to find best long/short exchanges for each coin"""
        analysis = {}
        
        for coin in COINS:
            coin_analysis = {
                'coin': coin,
                'exchanges': {},
                'best_long': None,
                'best_short': None,
                'summary': ''
            }
            
            exchange_medians = {}
            
            # Calculate median funding rate for each exchange
            for exchange in ['binance', 'bybit', 'okx', 'hyperliquid']:
                if coin in self.data and exchange in self.data[coin]:
                    rates = [item['funding_rate'] for item in self.data[coin][exchange]]
                    if rates:
                        median_rate = np.median(rates)
                        count = len(rates)
                        recent_rate = rates[-1] if rates else 0
                        
                        exchange_medians[exchange] = median_rate
                        
                        coin_analysis['exchanges'][exchange] = {
                            'median_funding': median_rate,
                            'data_points': count,
                            'recent_rate': recent_rate,
                            'recommendation': self._get_recommendation(median_rate)
                        }
            
            # Find best exchanges for long and short
            if exchange_medians:
                # Best long = lowest (most negative) median funding
                best_long_exchange = min(exchange_medians.items(), key=lambda x: x[1])
                # Best short = highest (most positive) median funding  
                best_short_exchange = max(exchange_medians.items(), key=lambda x: x[1])
                
                coin_analysis['best_long'] = {
                    'exchange': best_long_exchange[0].title(),
                    'median_funding': best_long_exchange[1],
                    'reason': self._get_long_reason(best_long_exchange[1])
                }
                
                coin_analysis['best_short'] = {
                    'exchange': best_short_exchange[0].title(),
                    'median_funding': best_short_exchange[1],
                    'reason': self._get_short_reason(best_short_exchange[1])
                }
                
                coin_analysis['summary'] = self._generate_summary(coin, coin_analysis)
            
            analysis[coin] = coin_analysis
        
        self.analysis_results = analysis
        return analysis
    
    def _get_recommendation(self, funding_rate: float) -> str:
        """Get recommendation based on funding rate"""
        if funding_rate < -0.01:
            return "Favorable for long positions"
        elif funding_rate > 0.01:
            return "Favorable for short positions"
        else:
            return "Neutral funding environment"
    
    def _get_long_reason(self, funding_rate: float) -> str:
        """Get reason for long position recommendation"""
        if funding_rate < 0:
            return f"You get paid {abs(funding_rate):.3f}% per 8h to long"
        else:
            return f"Lowest cost at {funding_rate:.3f}% per 8h"
    
    def _get_short_reason(self, funding_rate: float) -> str:
        """Get reason for short position recommendation"""
        if funding_rate > 0:
            return f"You get paid {funding_rate:.3f}% per 8h to short"
        else:
            return f"Lowest cost at {abs(funding_rate):.3f}% per 8h"
    
    def _generate_summary(self, coin: str, analysis: Dict) -> str:
        """Generate summary text for the coin"""
        long_info = analysis['best_long']
        short_info = analysis['best_short']
        
        return f"Long: {long_info['exchange']} ({long_info['reason']}) | Short: {short_info['exchange']} ({short_info['reason']})"
    
    def generate_table(self) -> pd.DataFrame:
        """Generate summary table"""
        table_data = []
        
        for coin, analysis in self.analysis_results.items():
            if analysis['best_long'] and analysis['best_short']:
                row = {
                    'Coin': coin,
                    'Best Long Exchange': f"{analysis['best_long']['exchange']} ({analysis['best_long']['reason']})",
                    'Best Short Exchange': f"{analysis['best_short']['exchange']} ({analysis['best_short']['reason']})"
                }
                table_data.append(row)
        
        return pd.DataFrame(table_data)
    
    def create_visualization(self, output_path: str = 'funding_rate_analysis.html'):
        """Create interactive visualization using Plotly"""
        fig = go.Figure()
        
        y_positions = list(range(len(COINS)))
        coin_labels = []
        long_texts = []
        short_texts = []
        
        for i, coin in enumerate(COINS):
            if coin in self.analysis_results:
                analysis = self.analysis_results[coin]
                coin_labels.append(coin)
                
                if analysis['best_long']:
                    long_text = f"Long: {analysis['best_long']['exchange']} ({analysis['best_long']['median_funding']:.3f}%)"
                    long_texts.append(long_text)
                else:
                    long_texts.append("No data")
                
                if analysis['best_short']:
                    short_text = f"Short: {analysis['best_short']['exchange']} ({analysis['best_short']['median_funding']:.3f}%)"
                    short_texts.append(short_text)
                else:
                    short_texts.append("No data")
            else:
                coin_labels.append(coin)
                long_texts.append("No data")
                short_texts.append("No data")
        
        # Create horizontal bar chart
        fig.add_trace(go.Bar(
            y=coin_labels,
            x=[1] * len(coin_labels),
            orientation='h',
            text=[f"{long}<br>{short}" for long, short in zip(long_texts, short_texts)],
            textposition='inside',
            marker=dict(color='rgba(50, 171, 96, 0.7)', line=dict(color='rgba(50, 171, 96, 1.0)', width=1)),
            name='Funding Rate Recommendations'
        ))
        
        fig.update_layout(
            title={
                'text': 'Optimal Long/Short Exchanges by Funding Rates',
                'x': 0.5,
                'xanchor': 'center',
                'font': {'size': 20}
            },
            xaxis=dict(showticklabels=False, showgrid=False, zeroline=False),
            yaxis=dict(title='Cryptocurrency', titlefont={'size': 14}),
            showlegend=False,
            height=600,
            margin=dict(l=100, r=100, t=80, b=50),
            plot_bgcolor='rgba(0,0,0,0)',
            paper_bgcolor='rgba(0,0,0,0)'
        )
        
        fig.write_html(output_path)
        print(f"Visualization saved to {output_path}")
        
        return fig
    
    def export_json(self, output_path: str = 'funding_analysis.json'):
        """Export analysis results to JSON"""
        with open(output_path, 'w') as f:
            json.dump(self.analysis_results, f, indent=2)
        print(f"Analysis results exported to {output_path}")

async def main():
    """Main execution function"""
    async with FundingRateAnalyzer() as analyzer:
        # Fetch data
        print("Starting funding rate analysis...")
        await analyzer.fetch_all_funding_data()
        
        # Analyze data
        print("Analyzing funding rates...")
        analysis = analyzer.analyze_funding_rates()
        
        # Generate table
        print("\n" + "="*80)
        print("FUNDING RATE ANALYSIS RESULTS")
        print("="*80)
        
        table = analyzer.generate_table()
        if not table.empty:
            print(table.to_string(index=False))
        else:
            print("No data available for analysis")
        
        # Generate visualization
        print("\nGenerating visualization...")
        analyzer.create_visualization()
        
        # Export JSON
        analyzer.export_json()
        
        print("\nAnalysis complete!")
        return analysis

if __name__ == "__main__":
    # Run the analyzer
    analysis_results = asyncio.run(main())