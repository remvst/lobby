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

export interface DataMessage extends Message {
    type: 'data';
    toUserId: string;
    data: any;
}

export interface TextMessage extends Message {
    type: 'text-message';
    message: string;
}

export type AnyMessage = LobbyUpdated | LobbyClosed | DataMessage | TextMessage;