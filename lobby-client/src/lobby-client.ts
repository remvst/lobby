import {
    PingResponse,
    User,
} from "../../shared/api";
import { Lobby } from "../../shared/lobby";
import {
    AnyMessage,
    DataMessage,
    SetMetadataMessage,
    StatusMessage,
    TextMessage,
} from "../../shared/message";
import { ConnectionState } from "./connection-state";
import { IServerApi, ISocket } from "./network";

export class LobbyClient {

    private socket: ISocket;
    readonly game: string;
    readonly api: IServerApi;
    private readonly users = new Map<string, User>();

    userId: string;
    lobby: Lobby;
    token: string;

    connectionState: ConnectionState = ConnectionState.DISCONNECTED;

    onLobbyUpdated: (lobby: Lobby) => void = () => {};
    onTextMessage: (userId: string, message: string) => void = () => {};
    onStatusMessage: (message: string) => void = () => {};
    onDataMessage: (userId: string, message: any) => void = () => {};
    onConnectionStateChanged: (state: ConnectionState) => void = () => {};

    constructor(opts: {
        readonly game: string;
        readonly api: IServerApi;
    }) {
        this.game = opts.game;
        this.api = opts.api;
    }

    user(id: string): User {
        return this.users.get(id);
    }

    private setConnectionState(state: ConnectionState) {
        this.connectionState = state;
        this.onConnectionStateChanged(this.connectionState);
    }

    sendTextMessage(message: string) {
        const payload: TextMessage = {
            fromUserId: this.userId,
            message: message,
            type: "text-message",
        };
        this.socket.send(payload);
    }

    sendDataMessage(toUserId: string, data: any) {
        const payload: DataMessage = {
            fromUserId: this.userId,
            toUserId: toUserId,
            data: data,
            type: "data",
        };
        this.socket.send(payload);
    }

    sendStatusMessage(message: string) {
        const payload: StatusMessage = {
            fromUserId: this.userId,
            message: message,
            type: "status-message",
        };
        this.socket.send(payload);
    }

    setMetadata(userId: string, key: string, value: any) {
        const payload: SetMetadataMessage = {
            fromUserId: this.userId,
            type: "set-metadata",
            userId,
            key,
            value,
        };
        this.socket.send(payload);
    }

    async listLobbies(): Promise<Lobby[]> {
        const resp = await this.api.listLobbies({
            game: this.game,
        });
        return resp.lobbies;
    }

    async ping(): Promise<PingResponse> {
        return this.api.ping({});
    }

    async createAndJoin(opts: {
        readonly playerDisplayName: string;
        readonly lobbyDisplayName: string;
    }) {
        const resp = await this.api.create({
            game: this.game,
            lobbyDisplayName: opts.lobbyDisplayName,
            playerDisplayName: opts.playerDisplayName,
        });

        const { token, user, lobby } = resp;
        this.userId = user.id;
        this.token = token;
        this.lobby = lobby;

        this.onLobbyUpdated(lobby);

        await this.connect();
    }

    async join(opts: {
        readonly playerDisplayName: string;
        readonly lobbyId: string;
    }) {
        const resp = await this.api.join({
            game: this.game,
            lobbyId: opts.lobbyId,
            playerDisplayName: opts.playerDisplayName,
        });

        const { token, user, lobby } = resp;
        this.userId = user.id;
        this.token = token;
        this.lobby = lobby;

        this.onLobbyUpdated(lobby);

        await this.connect();
    }

    private async connect() {
        this.setConnectionState(ConnectionState.CONNECTING);

        this.socket = await this.api.connect({
            token: this.token,
            onDisconnect: () => {
                this.setConnectionState(ConnectionState.DISCONNECTED);
            },
            onMessage: (message: any) => {
                this.onMessage(message)
            },
        })

        this.setConnectionState(ConnectionState.CONNECTED);
    }

    private onMessage(message: AnyMessage) {
        switch (message.type) {
            case "data":
                this.onDataMessage(message.fromUserId, message.data);
                break;
            case "lobby-closed":
                this.disconnect();
                break;
            case "lobby-updated":
                this.lobby = message.lobby;
                for (const user of this.lobby.participants) {
                    this.users.set(user.id, user);
                }
                this.onLobbyUpdated(this.lobby);
                break;
            case "text-message":
                this.onTextMessage(message.fromUserId, message.message);
                break;
            case "data":
                this.onDataMessage(message.fromUserId, message.data);
                break;
            case "status-message":
                this.onStatusMessage(message.message);
                break;
        }
    }

    async disconnect() {
        await this.api.leave({
            token: this.token,
        });

        this.socket?.disconnect();
        this.socket = null;
        this.token = null;
    }
}
