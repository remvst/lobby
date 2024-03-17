import { Lobby } from "./lobby";

export interface Message {
    type: string;
    fromUserId?: string;
}

export interface LobbyUpdated extends Message {
    type: 'lobby-updated';
    lobby: Lobby;
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

export interface StatusMessage extends Message {
    type: 'status-message';
    message: string;
}

export interface SetMetadataMessage extends Message {
    type: 'set-metadata';
    userId: string;
    key: string;
    value: any;
}

export type AnyMessage = LobbyUpdated | DataMessage | TextMessage | SetMetadataMessage | StatusMessage;