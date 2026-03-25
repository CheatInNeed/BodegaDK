import type { ClientToServerMessage } from '../../net/protocol.js';
import type { RoomTransport, RoomTransportHandlers } from '../types.js';

const HEARTBEAT_INTERVAL_MS = 7000;

/**
 * Browser WebSocket transport implementation of the RoomTransport interface.
 */
export function createWebSocketTransport(url: string): RoomTransport {
    let socket: WebSocket | null = null;
    let heartbeatTimer: number | null = null;

    const stopHeartbeat = () => {
        if (heartbeatTimer === null) return;
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    };

    const startHeartbeat = () => {
        stopHeartbeat();
        heartbeatTimer = window.setInterval(() => {
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                stopHeartbeat();
                return;
            }

            socket.send(JSON.stringify({
                type: 'HEARTBEAT',
                payload: {},
            } satisfies ClientToServerMessage));
        }, HEARTBEAT_INTERVAL_MS);
    };

    return {
        connect(handlers: RoomTransportHandlers) {
            stopHeartbeat();
            socket = new WebSocket(url);

            socket.addEventListener('open', () => handlers.onOpen());
            socket.addEventListener('close', () => {
                stopHeartbeat();
                handlers.onClose();
            });
            socket.addEventListener('error', () => handlers.onError('WebSocket connection error'));
            socket.addEventListener('message', (event) => {
                try {
                    const parsed = JSON.parse(event.data as string);
                    handlers.onMessage(parsed);
                } catch {
                    handlers.onError('Received malformed JSON from server');
                }
            });
        },

        send(message: ClientToServerMessage) {
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            socket.send(JSON.stringify(message));
            if (message.type === 'CONNECT') {
                startHeartbeat();
            }
        },

        close() {
            stopHeartbeat();
            socket?.close();
            socket = null;
        },
    };
}
