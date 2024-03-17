import { ListLobbiesRequest, ListLobbiesResponse, JoinLobbyRequest, JoinLobbyResponse, CreateLobbyRequest, CreateLobbyResponse, LeaveLobbyRequest, LeaveLobbyResponse, PingResponse, PingRequest } from "../../shared/api";
import { AnyMessage } from "../../shared/message";

export interface ISocket {
    send(payload: AnyMessage): void;
    disconnect(): Promise<void>;
}

export interface IServerApi {
    listLobbies(request: ListLobbiesRequest): Promise<ListLobbiesResponse>;
    join(request: JoinLobbyRequest): Promise<JoinLobbyResponse>;
    create(request: CreateLobbyRequest): Promise<CreateLobbyResponse>;
    leave(request: LeaveLobbyRequest): Promise<LeaveLobbyResponse>;
    connect(options: {
        readonly token: string;
        readonly onDisconnect: () => void;
        readonly onMessage: (message: AnyMessage) => void;
    }): Promise<ISocket>;
    ping(request: PingRequest): Promise<PingResponse>;
}