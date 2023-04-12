import { Lobby } from './lobby';

export interface ListLobbiesRequest {
    game: string;
}

export interface ListLobbiesResponse {
    lobbies: Lobby[];
}

export interface CreateLobbyRequest {
    lobbyDisplayName: string;
    playerDisplayName: string;
    game: string;
}

export interface CreateLobbyResponse {
    token: string;
    user: User;
    lobby: Lobby;
}

export interface JoinLobbyRequest {
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

export interface User {
    id: string;
    displayName: string;
    connected: boolean;
    lastConnected: number;
    metadata: {[key: string]: any};
}