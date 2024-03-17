import { CreateLobbyRequest, CreateLobbyResponse, JoinLobbyRequest, JoinLobbyResponse, LeaveLobbyRequest, LeaveLobbyResponse, ListLobbiesRequest, ListLobbiesResponse, PingRequest, PingResponse, User } from "../../shared/api";
import { Lobby } from "../../shared/lobby";
import { AnyMessage, DataMessage, LobbyUpdated, SetMetadataMessage } from "../../shared/message";
import { IServerApi, ISocket } from "./network";

function randomId() {
    return 'id' + ~~(Math.random() * 10000);
}

function copy(obj: any) {
    return JSON.parse(JSON.stringify(obj));
}

type Token = {userId: string, lobbyId: string};

export class InMemoryApi implements IServerApi {
    private readonly lobbies = new Map<string, Lobby>();
    private readonly sockets = new Map<string, InMemorySocket[]>();

    private notifyLobbyUpdate(lobby: Lobby) {
        lobby.lastUpdate = Date.now();

        const sockets = this.sockets.get(lobby.id) || [];
        const update: LobbyUpdated = {
            type: "lobby-updated",
            lobby: copy(lobby),
        };

        for (const socket of sockets) {
            socket.onMessage(update);
        }
    }

    private async sendDataMessage(
        toUserId: string,
        fromUserId: string,
        data: AnyMessage,
        lobbyId: string,
    ): Promise<void> {
        const sockets = this.sockets.get(lobbyId) || [];
        const socket = sockets.filter(socket => socket.userId === toUserId)[0];
        if (!socket) return;

        const message: DataMessage = {
            type: "data",
            toUserId,
            data: data,
            fromUserId,
        };

        socket.onMessage(message);
    }

    private async onMessageReceivedFromClient(lobbyId: string, fromUserId: string, message: AnyMessage) {
        switch (message.type) {
            case "data":
                await this.sendDataMessage(
                    message.toUserId,
                    fromUserId,
                    message.data,
                    lobbyId,
                );
                break;
            case "set-metadata":
                await this.setMetadata(lobbyId, message);
                break;
            case "status-message":
                break;
        }
    }

    async connect(options: {
        readonly token: string;
        readonly onDisconnect: () => void;
        readonly onMessage: (message: any) => void;
    }): Promise<ISocket> {
        const { lobbyId, userId } = JSON.parse(options.token) as Token;
        const lobby = this.lobbies.get(lobbyId);
        if (!lobby) throw new Error('Lobby not found');

        const socket = new InMemorySocket(
            userId,
            () => {
                options.onDisconnect();

                for (const participant of lobby.participants) {
                    if (participant.id !== userId) continue;
                    participant.connected = false;
                }

                this.notifyLobbyUpdate(lobby);
            },
            (message: AnyMessage) => this.onMessageReceivedFromClient(lobbyId, userId, message),
            (message) => options.onMessage(message),
        );

        if (!this.sockets.has(lobbyId)) {
            this.sockets.set(lobbyId, []);
        }
        this.sockets.get(lobbyId).push(socket);

        await socket.connect();

        for (const participant of lobby.participants) {
            if (participant.id !== userId) continue;
            participant.connected = true;
            participant.lastConnected = Date.now();
        }

        this.notifyLobbyUpdate(lobby);

        return socket;
    }

    async ping(request: PingRequest): Promise<PingResponse> {
        return {};
    }

    async listLobbies(payload: ListLobbiesRequest): Promise<ListLobbiesResponse> {
        return {
            lobbies: Array.from(this.lobbies.values()),
        };
    }

    async join(payload: JoinLobbyRequest): Promise<JoinLobbyResponse> {
        const lobby = this.lobbies.get(payload.lobbyId);
        if (!lobby) throw new Error('Lobby not found');

        const participant: User = {
            id: randomId(),
            metadata: {
                displayName: payload.playerDisplayName,
            },
            connected: false,
            lastConnected: 0
        };

        lobby.participants.push(participant);

        this.notifyLobbyUpdate(lobby);

        const token: Token = {
            userId: participant.id,
            lobbyId: lobby.id,
        };

        return {
            token: JSON.stringify(token),
            user: copy(participant),
            lobby: copy(lobby),
        };
    }

    async create(payload: CreateLobbyRequest): Promise<CreateLobbyResponse> {
        const participant: User = {
            id: randomId(),
            metadata: {
                displayName: payload.playerDisplayName,
            },
            connected: false,
            lastConnected: 0
        };

        const lobby: Lobby = {
            id: randomId(),
            game: payload.game,
            displayName: payload.lobbyDisplayName,
            leader: participant.id,
            maxParticipants: 5,
            participants: [participant],
            created: Date.now(),
            lastUpdate: Date.now(),
        };
        this.lobbies.set(lobby.id, lobby);

        const token: Token = {
            userId: participant.id,
            lobbyId: lobby.id,
        };

        this.notifyLobbyUpdate(lobby);

        return {
            token: JSON.stringify(token),
            user: copy(participant),
            lobby: copy(lobby),
        };
    }

    async leave(payload: LeaveLobbyRequest): Promise<LeaveLobbyResponse> {
        const token = JSON.parse(payload.token) as Token;

        const lobby = this.lobbies.get(token.lobbyId);
        if (!lobby) throw new Error('Lobby not found');

        lobby.participants = lobby.participants.filter(p => p.id !== token.userId);

        const sockets = this.sockets.get(lobby.id) || [];
        for (const socket of Array.from(sockets)) {
            if (socket.userId !== token.userId) continue;
            const index = sockets.indexOf(socket);
            if (index >= 0) sockets.splice(index, 1);
        }

        if (!lobby.participants.length) {
            this.lobbies.delete(lobby.id);
            this.sockets.delete(lobby.id);
        }

        this.notifyLobbyUpdate(lobby);

        return {};
    }

    private async setMetadata(lobbyId: string, message: SetMetadataMessage) {
        const lobby = this.lobbies.get(lobbyId);
        if (!lobby) throw new Error('Lobby not found');

        const participant = lobby.participants.filter(p => p.id === message.userId)[0];
        if (!participant) throw new Error('Lobby not found');

        participant.metadata[message.key] = message.value;
    }
}

export class InMemorySocket implements ISocket {

    constructor(
        readonly userId: string,
        readonly onDisconnected: () => void,
        readonly onSend: (message: AnyMessage) => void,
        readonly onMessage: (message: AnyMessage) => void,
    ) {
    }

    send(payload: AnyMessage): void {
        this.onSend(payload);
    }

    async connect(): Promise<void> {

    }

    async disconnect(): Promise<void> {
        this.onDisconnected();
    }
}