# Solana Arbitrage Bot

## Overview

This is a full-stack web application for a Solana arbitrage trading bot. The system consists of a React frontend with shadcn/ui components and a Node.js/Express backend with WebSocket support. The bot monitors arbitrage opportunities on the Solana blockchain and executes trades automatically based on user-configured parameters.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### July 16, 2025 - Live Trading Implementation
- Fixed Jupiter API rate limiting issues with proper delays and retry logic
- Implemented real wallet integration with enhanced private key parsing
- Added configurable mock/live modes for testing vs production
- Reduced scanning frequency to 15 seconds to prevent rate limits
- Bot now ready for live trading with user's actual Solana wallet

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **UI Library**: shadcn/ui with Radix UI components
- **Styling**: Tailwind CSS with custom dark theme
- **State Management**: React Query (TanStack Query) for server state
- **Routing**: Wouter for client-side routing
- **Real-time Updates**: WebSocket client for live data streaming

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **WebSocket**: Built-in WebSocket server for real-time communication
- **Database**: PostgreSQL with Drizzle ORM
- **Session Management**: In-memory storage with fallback to persistent storage

### Build System
- **Frontend**: Vite with React plugin
- **Backend**: esbuild for production builds
- **Development**: tsx for TypeScript execution
- **Styling**: PostCSS with Tailwind CSS and autoprefixer

## Key Components

### Database Schema
The application uses four main tables:
- `users`: User authentication and management
- `bot_config`: Bot configuration settings (tokens, profit thresholds, intervals)
- `trades`: Historical trade records with profit/loss tracking
- `arbitrage_opportunities`: Real-time opportunity detection logs

### Bot Service Layer
- **ArbitrageBot**: Main bot orchestrator that manages trading operations
- **SolanaService**: Handles Solana blockchain interactions and RPC connections
- **Storage Interface**: Abstraction layer for data persistence with in-memory fallback

### Real-time Communication
- WebSocket server integrated with Express for live updates
- Broadcasts for opportunity updates, trade executions, and bot status changes
- Automatic reconnection handling in the frontend

### UI Components
- **Dashboard**: Main interface showing live opportunities, trade history, and analytics
- **BotHeader**: Control panel for starting/stopping the bot
- **Sidebar**: Configuration panel for bot settings
- **OpportunitiesTable**: Real-time display of arbitrage opportunities
- **TradeHistory**: Historical trade performance
- **AnalyticsChart**: Profit visualization with Recharts
- **SystemStatus**: Connection and health monitoring

## Data Flow

1. **Bot Configuration**: User configures trading parameters through the sidebar
2. **Opportunity Detection**: Bot continuously monitors Solana markets for arbitrage opportunities
3. **Real-time Updates**: WebSocket broadcasts opportunities to connected clients
4. **Trade Execution**: Bot executes profitable trades based on configuration
5. **Performance Tracking**: All trades and opportunities are logged for analysis
6. **Dashboard Updates**: Frontend receives real-time updates for live monitoring

## External Dependencies

### Blockchain Integration
- **@solana/web3.js**: Core Solana blockchain interaction
- **@neondatabase/serverless**: PostgreSQL database connection
- **Jupiter API**: DEX aggregation for trade execution (referenced in attached assets)

### UI/UX Dependencies
- **@radix-ui**: Comprehensive component primitives
- **@tanstack/react-query**: Server state management
- **recharts**: Data visualization for analytics
- **lucide-react**: Icon library

### Development Tools
- **drizzle-orm**: Type-safe database operations
- **drizzle-kit**: Database schema management
- **zod**: Schema validation
- **wouter**: Lightweight routing

## Deployment Strategy

### Development Mode
- Frontend served through Vite dev server with HMR
- Backend runs with tsx for hot reloading
- WebSocket server integrated for real-time development

### Production Build
- Frontend: Vite builds optimized static assets
- Backend: esbuild bundles server code with external dependencies
- Single-server deployment with static file serving

### Database Management
- Drizzle migrations for schema changes
- Environment-based configuration
- Support for both local and cloud PostgreSQL instances

### Configuration Management
- Environment variables for sensitive data (RPC URLs, database connections)
- JSON configuration files for bot parameters
- Wallet integration through secure key file storage

The architecture prioritizes real-time performance for trading operations while maintaining a clean separation between the trading logic, data persistence, and user interface layers.