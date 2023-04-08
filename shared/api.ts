import { Lobby } from './lobby';

export interface ListLobbiesRequest {

}

export interface ListLobbiesResponse {
    lobbies: Lobby[];
}

export interface CreateLobbyRequest {
    lobbyDisplayName: string;
    playerDisplayName: string;
}

export interface CreateLobbyResponse {
    token: string;
    userId: string;
    lobby: Lobby;
}

export interface JoinLobbyRequest {
    lobbyId: string;
    playerDisplayName: string;
}

export interface JoinLobbyResponse {
    token: string;
    userId: string;
    lobby: Lobby;
}

export interface User {
    id: string;
    displayName: string;
    metadata: {[key: string]: any};
}