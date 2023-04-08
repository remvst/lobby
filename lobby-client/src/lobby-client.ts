import { Lobby } from "../../shared/lobby";
import { Socket, io } from "socket.io-client";

export default class LobbyClient {

    private socket: Socket;
    
    onLobbyUpdated: (lobby: Lobby) => void = () => {};
    onGameUpdate: (update: any) => void = () => {};
    onDisconnected: () => void;

    constructor(readonly opts: {
        readonly url: string,
        readonly lobbyId: string,
        readonly userId: string,
    }) {

    }

    async connect() {
        return new Promise<void>((resolve, reject) => {
            this.socket = io(this.opts.url, {
                'query': {
                    'lobbyId': this.opts.lobbyId,
                    'userId': this.opts.userId,
                }
            });
            this.socket.on('connect', () => resolve());
            this.socket.on('disconnect', () => this.onDisconnected());
            this.socket.on('connect_error', (err) => reject(err));
            this.socket.on('connect_timeout', (err) => reject(err));
            this.socket.connect();
        });
    }

    async disconnect() {
        this.socket.disconnect();
        this.socket = null;
    }

}