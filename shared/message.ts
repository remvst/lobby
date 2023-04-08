import { Lobby } from "./lobby";

export interface Message {
    type: string;
    fromUserId?: string;
}

export interface LobbyUpdated extends Message {
    type: 'lobby-updated';
    lobby: Lobby;
}

export interface LobbyClosed extends Message {
    type: 'lobby-closed';
    lobbyId: string;
}
export interface GameUpdate extends Message {
    type: 'game-update';
    data: any;
}

// TODO chat messages
// TODO meta messages (RTC connection)

export type AnyMessage = LobbyUpdated | LobbyClosed | GameUpdate;