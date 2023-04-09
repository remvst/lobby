import { Lobby } from '../../shared/lobby';

export interface Storage {
    getLobbies(): Promise<Lobby[]>;
    getLobby(id: string): Promise<Lobby>;
    updateLobby(lobby: Lobby): Promise<void>;
    deleteLobby(id: string): Promise<void>;
}

function randomDelay() {
    return new Promise(r => setTimeout(r, Math.random() * 1000));
}

export class InMemoryStorage implements Storage {

    private readonly lobbies = new Map<string, string>();

    async getLobbies(): Promise<Lobby[]> {
        await randomDelay();
        return Array.from(this.lobbies.values()).map(l => JSON.parse(l) as Lobby);
    }

    async getLobby(id: string): Promise<Lobby | null> {
        await randomDelay();
        const serialized = this.lobbies.get(id);
        if (!serialized) return null;
        return JSON.parse(serialized) as Lobby;
    }

    async updateLobby(lobby: Lobby): Promise<void> {
        await randomDelay();
        const serialized = JSON.stringify(lobby);
        this.lobbies.set(lobby.id, serialized);
    }

    async deleteLobby(id: string): Promise<void> {
        await randomDelay();
        this.lobbies.delete(id);
    }
}