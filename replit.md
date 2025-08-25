# Overview

This project is a Hyperliquid Statistical Arbitrage Platform MVP - a real-time trading signals dashboard that identifies and displays the best long/short perpetual pairs opportunities on Hyperliquid. The application focuses on statistical arbitrage by finding pairs with stable negative dependence and tradable, mean-reverting spreads. The MVP displays a single real-time card showing the best arbitrage opportunity with hedge ratio, signal strength (z-score), expected net edge, and 15-minute spread charts. This is a display-only system with no trade execution functionality.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The frontend is built with React + TypeScript using Vite as the build tool. It uses shadcn/ui components with Radix UI primitives for the component library, styled with Tailwind CSS in dark mode. The UI follows a dashboard pattern with real-time updates via WebSockets and polling with React Query for data management. The main dashboard displays system status cards, the best signal card with charts, live market prices, and signal history.

## Backend Architecture
The backend uses Express.js with TypeScript in ESM format. It follows a layered architecture with routes handling HTTP endpoints and WebSocket connections, a storage layer using in-memory storage (with an interface for future database integration), and mock data generation for demonstration purposes. The server provides REST API endpoints for signals, prices, and system status, plus WebSocket support for real-time updates.

## Database Design
The system uses Drizzle ORM with PostgreSQL as the target database (configured via Neon). The schema includes three main tables: signals (storing arbitrage opportunities with pair information, hedge ratios, z-scores, and edge calculations), prices (storing real-time market data with 24h changes), and system_status (tracking system health, data freshness, and provider status). The current implementation uses in-memory storage with a clear interface for database migration.

## Real-Time Data Flow
WebSocket connections provide real-time updates for signals, prices, and system status. The frontend maintains connection status and latency monitoring with automatic reconnection. Data flows from mock generators through the storage layer to WebSocket broadcasts and HTTP endpoints. React Query handles client-side caching with configured polling intervals for different data types.

## Signal Processing Architecture
The system is designed to process statistical arbitrage signals through a signal engine that calculates hedge ratios, z-scores, confidence levels, and net edge after fees/funding/slippage. Mock data currently simulates realistic trading pairs (BTC, ETH, SOL, etc.) with calculated spreads and historical data points for charting.

# External Dependencies

## UI Framework
- **React 18** with TypeScript for the frontend framework
- **Vite** for build tooling and development server
- **shadcn/ui** component library built on Radix UI primitives
- **Tailwind CSS** for styling with custom dark theme

## Backend Runtime
- **Node.js** with Express.js for the HTTP server
- **WebSocket (ws)** library for real-time communication
- **TypeScript** in ESM mode for type safety

## Database & ORM
- **PostgreSQL** as the target database (via Neon)
- **Drizzle ORM** for type-safe database operations
- **Drizzle Kit** for schema management and migrations

## State Management & Data Fetching
- **React Query** for server state management and caching
- **WebSocket** integration for real-time updates
- **Wouter** for client-side routing

## Development Tools
- **ESBuild** for backend bundling
- **TSX** for TypeScript execution in development
- **Replit integration** for development environment support

## Market Data Integration
The system is prepared for integration with Hyperliquid WebSocket feeds and Alchemy/GoldRush APIs for real-time and historical market data, though currently using mock data for demonstration.