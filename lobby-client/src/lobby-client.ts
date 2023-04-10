import { Lobby } from "../../shared/lobby";
import { Socket, io } from "socket.io-client";
import { AnyMessage, DataMessage, SetMetadataMessage, TextMessage } from '../../shared/message';
import { CreateLobbyRequest, CreateLobbyResponse, JoinLobbyRequest, JoinLobbyResponse, LeaveLobbyRequest, ListLobbiesResponse, User } from "../../shared/api";

export enum ConnectionState {
    DISCONNECTED = 'disconnected',
    CONNECTED = 'connected',
    CONNECTING = 'connecting',
}

export default class LobbyClient {

    private socket: Socket;
    private url: string;
    private readonly users = new Map<string, User>();

    userId: string;
    lobby: Lobby;
    token: string;

    connectionState: ConnectionState = ConnectionState.DISCONNECTED;
    
    onLobbyUpdated: (lobby: Lobby) => void = () => {};
    onTextMessage: (userId: string, message: string) => void = () => {};
    onDataMessage: (userId: string, message: any) => void = () => {};
    onConnectionStateChanged: (state: ConnectionState) => void = () => {};

    constructor(opts: {
        readonly url: string,
    }) {
        this.url = opts.url;
    }

    user(id: string): User {
        return this.users.get(id);
    }

    private setConnectionState(state: ConnectionState) {
        this.connectionState = state;
        this.onConnectionStateChanged(this.connectionState);
    }

    sendTextMessage(message: string) {
        this.socket.emit('message', {
            'fromUserId': this.userId,
            'message': message,
            'type': 'text-message',
        } as TextMessage);
    }

    sendDataMessage(toUserId: string, data: any) {
        this.socket.emit('message', {
            'fromUserId': this.userId,
            'toUserId': toUserId,
            'data': data,
            'type': 'data',
        } as DataMessage);
    }

    setMetadata(userId: string, key: string, value: any) {
        this.socket.emit('message', {
            'fromUserId': this.userId,
            'type': 'set-metadata',
            userId,
            key, 
            value,
        } as SetMetadataMessage);
    }

    async listLobbies(): Promise<Lobby[]> {
        const resp = await fetch(`${this.url}/lobbies`);
        const json = await resp.json() as ListLobbiesResponse;
        return json.lobbies;
    }

    async createAndJoin(opts: {
        readonly playerDisplayName: string,
        readonly lobbyDisplayName: string,
    }) {
        const resp = await fetch(`${this.url}/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                lobbyDisplayName: opts.lobbyDisplayName,
                playerDisplayName: opts.playerDisplayName,
            } as CreateLobbyRequest),
        });

        const json = await resp.json() as CreateLobbyResponse;
        const { token, user } = json;
        this.userId = user.id;
        this.token = token;
        return await this.connect({ token });
    }

    async join(opts: {
        readonly playerDisplayName: string,
        readonly lobbyId: string,
    }) {
        const resp = await fetch(`${this.url}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                lobbyId: opts.lobbyId,
                playerDisplayName: opts.playerDisplayName,
            } as JoinLobbyRequest),
        });

        const json = await resp.json() as JoinLobbyResponse;
        const { token, user } = json;
        this.userId = user.id;
        this.token = token;
        return await this.connect({ token });
    }

    private async connect(opts: {
        readonly token: string,
    }) {
        return new Promise<void>((resolve, reject) => {
            this.setConnectionState(ConnectionState.CONNECTING);

            this.socket = io(this.url, {
                reconnection: false,
                query: {
                    token: opts.token,
                },
            });
            this.socket.on('connect', () => {
                this.setConnectionState(ConnectionState.CONNECTED);
                resolve();
            });
            this.socket.on('disconnect', () => {
                this.setConnectionState(ConnectionState.DISCONNECTED);
                reject(new Error('Disconnected'));
            });
            this.socket.on('connect_error', (err) => reject(err));
            this.socket.on('connect_timeout', (err) => reject(err));
            this.socket.on('msg', (msg) => this.onMessage(msg));
            this.socket.connect();
        });
    }

    private onMessage(message: AnyMessage) {
        switch (message.type) {
        case 'data':
            this.onDataMessage(message.fromUserId, message.data);
            break;
        case 'lobby-closed':
            this.disconnect();
            break;
        case 'lobby-updated':
            this.lobby = message.lobby;
            for (const user of this.lobby.participants) {
                this.users.set(user.id, user);
            }
            this.onLobbyUpdated(this.lobby);
            break;
        case 'text-message':
            this.onTextMessage(message.fromUserId, message.message);
            break;
        case 'data':
            this.onDataMessage(message.fromUserId, message.data);
            break;
        }
    }

    async disconnect() {
        this.socket.disconnect();
        this.socket = null;

        await fetch(`${this.url}/leave`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                token: this.token,
            } as LeaveLobbyRequest),
        });

        this.token = null;
    }

}