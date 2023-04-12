import { Lobby } from '../../shared/lobby';

export interface Storage {
    getLobbies(game: string): Promise<Lobby[]>;
    getLobby(id: string): Promise<Lobby>;
    updateLobby(lobby: Lobby): Promise<void>;
    deleteLobby(id: string): Promise<void>;
}

export class InMemoryStorage implements Storage {

    private readonly lobbies = new Map<string, string>();
    
    constructor(private readonly maxDelay: number = 0) {
        
    }

    private randomDelay() {
        return new Promise(r => setTimeout(r, Math.random() * this.maxDelay));
    }

    async getLobbies(game: string): Promise<Lobby[]> {
        await this.randomDelay();
        return Array.from(this.lobbies.values())
            .map(l => JSON.parse(l) as Lobby)
            .filter(lobby => lobby.game === game);
    }

    async getLobby(id: string): Promise<Lobby | null> {
        await this.randomDelay();
        const serialized = this.lobbies.get(id);
        if (!serialized) return null;
        return JSON.parse(serialized) as Lobby;
    }

    async updateLobby(lobby: Lobby): Promise<void> {
        await this.randomDelay();
        const serialized = JSON.stringify(lobby);
        this.lobbies.set(lobby.id, serialized);
    }

    async deleteLobby(id: string): Promise<void> {
        await this.randomDelay();
        this.lobbies.delete(id);
    }
}