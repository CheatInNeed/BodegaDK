/**
 * Browser WebSocket transport implementation of the RoomTransport interface.
 */
export function createWebSocketTransport(url) {
    let socket = null;
    return {
        connect(handlers) {
            socket = new WebSocket(url);
            socket.addEventListener('open', () => handlers.onOpen());
            socket.addEventListener('close', () => {
                handlers.onClose();
            });
            socket.addEventListener('error', () => handlers.onError('WebSocket connection error'));
            socket.addEventListener('message', (event) => {
                try {
                    const parsed = JSON.parse(event.data);
                    handlers.onMessage(parsed);
                }
                catch {
                    handlers.onError('Received malformed JSON from server');
                }
            });
        },
        send(message) {
            if (!socket || socket.readyState !== WebSocket.OPEN)
                return;
            socket.send(JSON.stringify(message));
        },
        close() {
            socket?.close();
            socket = null;
        },
    };
}
