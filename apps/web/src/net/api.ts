type CreateRoomResponse = { roomCode: string };
type JoinRoomResponse = { ok: boolean };

export async function createRoom(input: { gameType: string }): Promise<CreateRoomResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        throw new Error(`Failed to create room (${response.status})`);
    }
    return response.json() as Promise<CreateRoomResponse>;
}

export async function joinRoom(input: { roomCode: string; playerId: string; token: string }): Promise<JoinRoomResponse> {
    const response = await fetch(`${resolveApiBaseUrl()}/rooms/${encodeURIComponent(input.roomCode)}/join`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            playerId: input.playerId,
            token: input.token,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to join room (${response.status})`);
    }
    return response.json() as Promise<JoinRoomResponse>;
}

function resolveApiBaseUrl(): string {
    if (window.location.port === '5173') {
        return 'http://localhost:8080';
    }
    return '/api';
}
