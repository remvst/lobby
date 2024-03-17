import { Lobby } from './lobby';

export const METADATA_DISPLAY_NAME_KEY = 'displayName';
export type METADATA_DISPLAY_NAME_KEY_TYPE = 'displayName';

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

export interface UserShort {
    id: string;
    connected: boolean;
    lastConnected: number;
}

export type UserMetadata = {[key: string]: any} & { [key in METADATA_DISPLAY_NAME_KEY_TYPE]: string; };

export interface User extends UserShort {
    metadata: UserMetadata;
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

export interface PingRequest {

}

export interface PingResponse {

}

export interface ServiceApi {
    listLobbies(request: ListLobbiesRequest): Promise<ListLobbiesResponse>;
    join(request: JoinLobbyRequest): Promise<JoinLobbyResponse>;
    create(request: CreateLobbyRequest): Promise<CreateLobbyResponse>;
    leave(request: LeaveLobbyRequest): Promise<LeaveLobbyResponse>;
    ping(request: PingRequest): Promise<PingResponse>;
}