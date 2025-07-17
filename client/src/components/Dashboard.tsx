import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { useWebSocket } from '../contexts/WebSocketContext'
import { useToast } from './ui/toaster'
import { formatNumber, formatPercentage, formatTimeAgo, getStatusColor, getProfitColor } from '../lib/utils'
import { Play, Square, Settings, TrendingUp, TrendingDown, Activity, Wifi, WifiOff } from 'lucide-react'

interface BotStatus {
  isRunning: boolean
  config: any
  lastScan: number
  errors: number
  solanaConnected: boolean
  dbConnected: boolean
  wsConnections: number
}

interface Trade {
  id: string
  tokenA: string
  tokenB: string
  amountIn: number
  amountOut: number
  profit: number
  profitPercentage: number
  txSignature?: string
  status: 'pending' | 'completed' | 'failed'
  errorMessage?: string
  executedAt: number
  isMock: boolean
}

interface Opportunity {
  id: string
  tokenA: string
  tokenB: string
  priceA: number
  priceB: number
  profitOpportunity: number
  profitPercentage: number
  amountRequired: number
  dexA: string
  dexB: string
  detectedAt: number
  wasExecuted: boolean
}

export function Dashboard() {
  const { isConnected, lastMessage, connectionStatus } = useWebSocket()
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const [recentTrades, setRecentTrades] = useState<Trade[]>([])
  const [recentOpportunities, setRecentOpportunities] = useState<Opportunity[]>([])

  // Fetch bot status
  const { data: botStatus, isLoading: statusLoading } = useQuery<BotStatus>({
    queryKey: ['bot-status'],
    queryFn: async () => {
      const response = await fetch('/api/bot/status')
      if (!response.ok) throw new Error('Failed to fetch bot status')
      return response.json()
    },
    refetchInterval: 5000
  })

  // Fetch trades
  const { data: trades } = useQuery<Trade[]>({
    queryKey: ['trades'],
    queryFn: async () => {
      const response = await fetch('/api/trades')
      if (!response.ok) throw new Error('Failed to fetch trades')
      return response.json()
    },
    refetchInterval: 10000
  })

  // Fetch opportunities
  const { data: opportunities } = useQuery<Opportunity[]>({
    queryKey: ['opportunities'],
    queryFn: async () => {
      const response = await fetch('/api/opportunities')
      if (!response.ok) throw new Error('Failed to fetch opportunities')
      return response.json()
    },
    refetchInterval: 10000
  })

  // Start bot mutation
  const startBotMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/bot/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId: 'demo-config' })
      })
      if (!response.ok) throw new Error('Failed to start bot')
      return response.json()
    },
    onSuccess: () => {
      addToast({
        title: 'Bot Started',
        description: 'The arbitrage bot is now running',
        variant: 'success'
      })
      queryClient.invalidateQueries({ queryKey: ['bot-status'] })
    },
    onError: (error: Error) => {
      addToast({
        title: 'Error',
        description: error.message,
        variant: 'error'
      })
    }
  })

  // Stop bot mutation
  const stopBotMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/bot/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!response.ok) throw new Error('Failed to stop bot')
      return response.json()
    },
    onSuccess: () => {
      addToast({
        title: 'Bot Stopped',
        description: 'The arbitrage bot has been stopped',
        variant: 'success'
      })
      queryClient.invalidateQueries({ queryKey: ['bot-status'] })
    },
    onError: (error: Error) => {
      addToast({
        title: 'Error',
        description: error.message,
        variant: 'error'
      })
    }
  })

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return

    switch (lastMessage.type) {
      case 'trade':
        const tradeData = lastMessage.data as Trade
        setRecentTrades(prev => [tradeData, ...prev.slice(0, 9)])
        
        if (tradeData.status === 'completed') {
          addToast({
            title: 'Trade Completed',
            description: `Profit: ${formatNumber(tradeData.profit, 4)} SOL (${formatPercentage(tradeData.profitPercentage)})`,
            variant: 'success'
          })
        } else if (tradeData.status === 'failed') {
          addToast({
            title: 'Trade Failed',
            description: tradeData.errorMessage || 'Unknown error',
            variant: 'error'
          })
        }
        break

      case 'opportunity':
        const opportunityData = lastMessage.data as Opportunity
        setRecentOpportunities(prev => [opportunityData, ...prev.slice(0, 9)])
        break

      case 'bot_status':
        queryClient.invalidateQueries({ queryKey: ['bot-status'] })
        break
    }
  }, [lastMessage, addToast, queryClient])

  const totalProfit = recentTrades.reduce((sum, trade) => 
    trade.status === 'completed' ? sum + trade.profit : sum, 0
  )

  const successfulTrades = recentTrades.filter(trade => trade.status === 'completed').length
  const failedTrades = recentTrades.filter(trade => trade.status === 'failed').length

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Solana Arbitrage Bot</h1>
            <p className="text-muted-foreground">Real-time arbitrage trading on Solana</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
              isConnected 
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
            }`}>
              {isConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {connectionStatus}
            </div>

            {/* Bot Controls */}
            <div className="flex gap-2">
              <Button
                onClick={() => startBotMutation.mutate()}
                disabled={botStatus?.isRunning || startBotMutation.isPending}
                variant={botStatus?.isRunning ? "secondary" : "default"}
              >
                <Play className="h-4 w-4 mr-2" />
                {botStatus?.isRunning ? 'Running' : 'Start Bot'}
              </Button>
              
              <Button
                onClick={() => stopBotMutation.mutate()}
                disabled={!botStatus?.isRunning || stopBotMutation.isPending}
                variant="destructive"
              >
                <Square className="h-4 w-4 mr-2" />
                Stop Bot
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bot Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statusLoading ? 'Loading...' : botStatus?.isRunning ? 'Running' : 'Stopped'}
              </div>
              <p className="text-xs text-muted-foreground">
                {botStatus?.lastScan ? `Last scan: ${formatTimeAgo(botStatus.lastScan)}` : 'No scans yet'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getProfitColor(totalProfit)}`}>
                {formatNumber(totalProfit, 4)} SOL
              </div>
              <p className="text-xs text-muted-foreground">
                From {successfulTrades} successful trades
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {recentTrades.length > 0 
                  ? formatPercentage((successfulTrades / recentTrades.length) * 100)
                  : '0%'
                }
              </div>
              <p className="text-xs text-muted-foreground">
                {successfulTrades} success, {failedTrades} failed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Opportunities</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recentOpportunities.length}</div>
              <p className="text-xs text-muted-foreground">
                Recent opportunities detected
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Trades */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Trades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentTrades.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No trades yet</p>
                ) : (
                  recentTrades.slice(0, 5).map(trade => (
                    <div key={trade.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{trade.tokenA} → {trade.tokenB}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatTimeAgo(trade.executedAt)}
                          {trade.isMock && ' (Mock)'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-medium ${getProfitColor(trade.profit)}`}>
                          {formatNumber(trade.profit, 4)} SOL
                        </div>
                        <div className={`text-sm ${getStatusColor(trade.status)}`}>
                          {trade.status}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Opportunities */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Opportunities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentOpportunities.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No opportunities yet</p>
                ) : (
                  recentOpportunities.slice(0, 5).map(opportunity => (
                    <div key={opportunity.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{opportunity.tokenA} → {opportunity.tokenB}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatTimeAgo(opportunity.detectedAt)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-medium ${getProfitColor(opportunity.profitOpportunity)}`}>
                          {formatPercentage(opportunity.profitPercentage)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatNumber(opportunity.profitOpportunity, 4)} SOL
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}