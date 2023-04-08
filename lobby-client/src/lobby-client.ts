import { Lobby } from "../../shared/lobby";
import { Socket, io } from "socket.io-client";
import { AnyMessage, DataMessage, TextMessage } from '../../shared/message';

export enum ConnectionState {
    DISCONNECTED = 'disconnected',
    CONNECTED = 'connected',
    CONNECTING = 'connecting',
}

export default class LobbyClient {

    private socket: Socket;
    private url: string;
    private lobbyId: string;
    private userId: string;

    connectionState: ConnectionState = ConnectionState.DISCONNECTED;
    
    onLobbyUpdated: (lobby: Lobby) => void = () => {};
    onTextMessage: (userId: string, message: string) => void = () => {};
    onDataMessage: (userId: string, message: any) => void = () => {};
    onConnectionStateChanged: (state: ConnectionState) => void = () => {};

    constructor(readonly opts: {
        readonly url: string,
    }) {
        this.url = opts.url;
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

    sendData(toUserId: string, data: any) {
        this.socket.emit('message', {
            'fromUserId': this.userId,
            'data': data,
            'toUserId': toUserId,
            'type': 'data',
        } as DataMessage);
    }

    async listLobbies(): Promise<Lobby[]> {
        const resp = await fetch(`${this.url}/lobbies`);
        const json = await resp.json();
        return json.lobbies;
    }

    async connect(opts: {
        readonly lobbyId: string,
        readonly userId: string,
    }) {
        this.lobbyId = opts.lobbyId;
        this.userId = opts.userId;

        return new Promise<void>((resolve, reject) => {
            this.setConnectionState(ConnectionState.CONNECTING);

            this.socket = io(this.opts.url, {
                reconnection: false,
                query: {
                    lobbyId: this.lobbyId,
                    userId: this.userId,
                },
            });
            this.socket.on('connect', () => {
                this.setConnectionState(ConnectionState.CONNECTED);
                resolve();
            });
            this.socket.on('disconnect', () => this.setConnectionState(ConnectionState.DISCONNECTED));
            this.socket.on('connect_error', (err) => reject(err));
            this.socket.on('connect_timeout', (err) => reject(err));
            this.socket.on('msg', (msg) => this.onMessage(msg));
            this.socket.connect();
        });
    }

    private onMessage(message: AnyMessage) {
        console.log(message);
        switch (message.type) {
        case 'data':
            this.onDataMessage(message.fromUserId, message.data);
            break;
        case 'lobby-closed':
            this.disconnect();
            break;
        case 'lobby-updated':
            this.onLobbyUpdated(message.lobby);
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
    }

}