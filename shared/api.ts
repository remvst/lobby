import { Lobby } from './lobby';

export interface ListLobbiesRequest {
    game: string;
}

export interface ListLobbiesResponse {
    lobbies: Lobby[];
}

export interface CreateLobbyRequest {
    game: string;
    lobbyDisplayName: string;
    playerDisplayName: string;
}

export interface CreateLobbyResponse {
    token: string;
    user: User;
    lobby: Lobby;
}

export interface JoinLobbyRequest {
    game: string;
    lobbyId: string;
    playerDisplayName: string;
}

export interface JoinLobbyResponse {
    token: string;
    user: User;
    lobby: Lobby;
}

export interface LeaveLobbyRequest {
    token: string;
}

export interface LeaveLobbyResponse {
}

export interface DestroyLobbyRequest {
    token: string;
}

export interface DestroyLobbyResponse {
}

export interface User {
    id: string;
    displayName: string;
    connected: boolean;
    lastConnected: number;
    metadata: {[key: string]: any};
}

export interface SendTextMessageRequest {
    game: string;
    lobbyId: string;
    fromUserId: string;
    message: string;
}

export interface SendTextMessageResponse {

}

export interface SendDataMessageRequest {
    game: string;
    lobbyId: string;
    fromUserId: string;
    toUserId: string;
    data: any;
}

export interface SendDataMessageResponse {

}

export interface SetMetadataRequest {
    game: string;
    lobbyId: string;
    userId: string;
    key: string;
    value: number | boolean | string;
}

export interface SetMetadataResponse {

}

export interface SendStatusMessageRequest {
    game: string;
    lobbyId: string;
    fromUserId: string;
    message: string;
}

export interface SendStatusMessageResponse {

}
