import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { WebSocketMessage, BotStatusMessage, OpportunityMessage, TradeMessage } from '@shared/types'

interface WebSocketContextType {
  isConnected: boolean
  lastMessage: WebSocketMessage | null
  sendMessage: (message: any) => void
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error'
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected')

  const connect = useCallback(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      return
    }

    setConnectionStatus('connecting')
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws`
    
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('✅ WebSocket connected')
      setIsConnected(true)
      setConnectionStatus('connected')
    }

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data)
        setLastMessage(message)
        
        // Handle different message types
        switch (message.type) {
          case 'bot_status':
            console.log('🤖 Bot status update:', (message as BotStatusMessage).data)
            break
          case 'opportunity':
            console.log('🎯 New opportunity:', (message as OpportunityMessage).data)
            break
          case 'trade':
            console.log('💰 Trade update:', (message as TradeMessage).data)
            break
          case 'heartbeat':
            // Silent heartbeat
            break
          default:
            console.log('📨 WebSocket message:', message)
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    }

    ws.onclose = (event) => {
      console.log('🔌 WebSocket disconnected:', event.code, event.reason)
      setIsConnected(false)
      setConnectionStatus('disconnected')
      
      // Auto-reconnect after 3 seconds
      setTimeout(() => {
        if (document.visibilityState === 'visible') {
          connect()
        }
      }, 3000)
    }

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error)
      setConnectionStatus('error')
    }

    setSocket(ws)
  }, [socket])

  const sendMessage = useCallback((message: any) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket is not connected')
    }
  }, [socket])

  useEffect(() => {
    connect()

    // Reconnect when tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isConnected) {
        connect()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (socket) {
        socket.close()
      }
    }
  }, [])

  return (
    <WebSocketContext.Provider value={{
      isConnected,
      lastMessage,
      sendMessage,
      connectionStatus
    }}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket() {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
}