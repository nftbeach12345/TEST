import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { WebSocketMessage } from '../shared/types.js';

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(server: any) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws'
    });

    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleConnection(ws, request);
    });

    console.log('📡 WebSocket server initialized');
  }

  private handleConnection(ws: WebSocket, request: IncomingMessage) {
    console.log('🔌 New WebSocket connection from:', request.socket.remoteAddress);
    
    this.clients.add(ws);

    // Send welcome message
    this.sendToClient(ws, {
      type: 'connection',
      data: { status: 'connected' },
      timestamp: Date.now()
    });

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(ws, message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      console.log('🔌 WebSocket connection closed');
      this.clients.delete(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.clients.delete(ws);
    });

    // Send periodic heartbeat
    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendToClient(ws, {
          type: 'heartbeat',
          timestamp: Date.now()
        });
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 30000); // 30 seconds
  }

  private handleMessage(ws: WebSocket, message: any) {
    console.log('📨 Received WebSocket message:', message.type);

    switch (message.type) {
      case 'ping':
        this.sendToClient(ws, {
          type: 'pong',
          timestamp: Date.now()
        });
        break;

      case 'subscribe':
        // Handle subscription to specific events
        // For now, all clients get all messages
        this.sendToClient(ws, {
          type: 'subscribed',
          data: { channel: message.channel },
          timestamp: Date.now()
        });
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private sendToClient(ws: WebSocket, message: WebSocketMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('Error sending message to client:', error);
        this.clients.delete(ws);
      }
    }
  }

  // Broadcast message to all connected clients
  broadcast(message: WebSocketMessage) {
    const messageString = JSON.stringify(message);
    const deadClients: WebSocket[] = [];

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageString);
        } catch (error) {
          console.error('Error broadcasting to client:', error);
          deadClients.push(client);
        }
      } else {
        deadClients.push(client);
      }
    });

    // Clean up dead connections
    deadClients.forEach(client => {
      this.clients.delete(client);
    });

    console.log(`📡 Broadcasted ${message.type} to ${this.clients.size} clients`);
  }

  // Send message to specific client (if needed in the future)
  sendToSpecificClient(clientId: string, message: WebSocketMessage) {
    // This would require client identification/authentication
    // For now, we use broadcast for all messages
    this.broadcast(message);
  }

  // Get connection stats
  getStats() {
    return {
      connectedClients: this.clients.size,
      totalConnections: this.clients.size // Could track historical data
    };
  }

  // Close all connections (for graceful shutdown)
  closeAllConnections() {
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, 'Server shutting down');
      }
    });
    this.clients.clear();
    console.log('🔌 All WebSocket connections closed');
  }
}