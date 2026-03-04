import type { ClientToServerMessage } from '../../net/protocol.js';
import type { RoomTransport, RoomTransportHandlers } from '../types.js';

/**
 * Browser WebSocket transport implementation of the RoomTransport interface.
 */
export function createWebSocketTransport(url: string): RoomTransport {
    let socket: WebSocket | null = null;

    return {
        connect(handlers: RoomTransportHandlers) {
            socket = new WebSocket(url);

            socket.addEventListener('open', () => handlers.onOpen());
            socket.addEventListener('close', () => handlers.onClose());
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
        },

        close() {
            socket?.close();
            socket = null;
        },
    };
}
