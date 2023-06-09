import { Server, Socket } from "socket.io";
import { LobbyController } from "./lobby-controller";
import { CreateLobbyRequest, CreateLobbyResponse, JoinLobbyRequest, JoinLobbyResponse, LeaveLobbyRequest, LeaveLobbyResponse, ListLobbiesRequest, ListLobbiesResponse, User } from '../../shared/api';
import { createLogger } from "bunyan";
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { TokenFormat } from "./model/token";
import TaskQueue from "./task-queue";
import { AutoKickTaskPayload } from "./task-params";
import { Storage } from './storage/storage';
import { AnyMessage, LobbyUpdated } from "../../shared/message";
import { Lobby } from "../../shared/lobby";
import { LobbyDetails } from "./model/lobby-details";

const MAX_DISCONNECTION_TIME = 15000;
const ONE_SECOND = 1000;
const ONE_MINUTE = ONE_SECOND * 60;
const ONE_HOUR = ONE_MINUTE * 60;

export default class LobbyServer {

    private readonly logger = createLogger({name: `lobby-server`});
    private readonly lobbies = new Map<string, LobbyController>();
    private readonly taskQueue = new TaskQueue();
    private readonly storage: Storage;

    constructor(private readonly options: {
        readonly secretKey: string,   
        readonly storage: Storage,
        readonly maxLobbyParticipants: number,
    }) {
        this.storage = options.storage;

        this.taskQueue.defineExecutor<AutoKickTaskPayload>('auto-kick', async payload => {
            const { lobbyId, userId, game } = payload;
            const lobby = await this.storage.lobbies(game).item(lobbyId).get();
            if (!lobby) return;

            const participant = await this.storage.participants(lobby.id).item(userId).get();
            if (!participant || participant.lastConnected !== payload.lastConnected) return;

            this.logger.info('Autokicking', { lobbyId, userId });

            await this.leaveLobby(lobby, userId);
        });
    }

    setup(server: http.Server, app: any) {
        const io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
        });
        app.use(express.json());

        io.on("connection", (socket: Socket) => {
            this.onNewConnection(socket);
        });

        app.get('/lobbies', async (req, res) => {
            const request: ListLobbiesRequest = req.query;

            const { game } = request;
            if (!game) {
                res.status(400).json({'reason': 'Missing game parameter'});
                return;
            }

            const lobbyDetails: LobbyDetails[] = Array.from((await this.storage.lobbies(game).entries()).values());
            
            const allLobbies = await Promise.all(lobbyDetails
                .map(async (details) => {
                    const entries = await this.storage.participants(details.id).entries();
                    const lobby: Lobby = {
                        ...details,
                        participants: Array.from(entries.values()),
                    };
                    return lobby;  
                })
            );
            const lobbies = allLobbies
                .filter(lobby => lobby.participants.length > 0)
                .filter(lobby => Date.now() - lobby.lastUpdate < 2 * ONE_HOUR)
                .filter(lobby => lobby.participants.filter(p => p.connected).length > 0);
            const response: ListLobbiesResponse = { lobbies };

            res.json(response);
        });

        app.post('/leave', async (req, res) => {
            const request: LeaveLobbyRequest = req.body;
            const { token } = request;

            let decoded: TokenFormat;
            try {
                decoded = this.verifyToken(token);
            } catch (err) {
                res.status(400).json({'reason': 'Invalid token'});
                return;
            }

            const { lobbyId, userId, game } = decoded;
            const lobby = await this.storage.lobbies(game).item(lobbyId).get();
            if (!lobby) {
                res.status(404).json({'reason': 'Lobby not found'});
                return;
            }

            await this.leaveLobby(lobby, userId);
            res.json({} as LeaveLobbyResponse);
        });

        app.post('/create', async (req, res) => {
            const request: CreateLobbyRequest = req.body;
            const { lobbyDisplayName, playerDisplayName, game } = request;

            if (!lobbyDisplayName || !playerDisplayName || !game) {
                res.status(400).json({'reason': 'Missing parameter'});
                return;
            }

            const user: User = {
                id: uuidv4(),
                displayName: playerDisplayName,
                lastConnected: 0,
                connected: false,
                metadata: {},
            };

            const lobby: LobbyDetails = {
                id: uuidv4(),
                displayName: lobbyDisplayName,
                leader: user.id,
                game: game,
                maxParticipants: this.options.maxLobbyParticipants,
                created: Date.now(),
                lastUpdate: Date.now(),
            };

            await this.storage.participants(lobby.id).item(user.id).set(user);
            await this.updateLobby(lobby);

            const data: TokenFormat = { userId: user.id, lobbyId: lobby.id, game };
            const token = jwt.sign({ data }, this.options.secretKey);

            const payload: AutoKickTaskPayload = {
                lobbyId: lobby.id,
                userId: user.id,
                lastConnected: user.lastConnected,
                game,
            };

            this.taskQueue.schedule({
                scheduledTime: Date.now() + MAX_DISCONNECTION_TIME,
                type: 'auto-kick',
                payload,
            });

            res.json({ token, user, lobby } as CreateLobbyResponse);
        });

        app.post('/join', async (req, res) => {
            const request: JoinLobbyRequest = req.body;
            const { playerDisplayName, lobbyId, game } = request;

            if (!playerDisplayName || !lobbyId || !game) {
                res.status(400).json({'reason': 'Missing parameter'});
                return;
            }

            const lobby = await this.storage.lobbies(game).item(lobbyId).get();
            if (!lobby) {
                res.status(404).json({'reason': 'Lobby not found'});
                return;
            }

            const participantCount = await this.storage.participants(lobbyId).size();
            if (participantCount >= lobby.maxParticipants) {
                res.status(403).json({'reason': 'Lobby is full'});
                return;
            }

            const user: User = {
                id: uuidv4(),
                displayName: playerDisplayName,
                connected: false,
                lastConnected: 0,
                metadata: {},
            };
            await this.storage.participants(lobbyId).item(user.id).set(user);
            await this.updateLobby(lobby);

            const payload: AutoKickTaskPayload = {
                lobbyId: lobby.id,
                userId: user.id,
                lastConnected: user.lastConnected,
                game,
            };

            this.taskQueue.schedule({
                scheduledTime: Date.now() + MAX_DISCONNECTION_TIME,
                type: 'auto-kick',
                payload,
            });

            const data: TokenFormat = { userId: user.id, lobbyId, game };
            const token = jwt.sign({ data }, this.options.secretKey);

            res.json({
                token,
                user,
                lobby,
            } as JoinLobbyResponse);
        });
    }

    verifyToken(token: string): TokenFormat {
        let decoded;
        try {
            decoded = jwt.verify(token, this.options.secretKey);
        } catch (err) {
            throw new Error('Invalid token');
        }

        return decoded.data as TokenFormat;
    }

    private async onNewConnection(socket: Socket) {
        const { query } = socket.handshake;
        const { token } = query as {[key: string]: string};

        this.logger.info('New connection', { token });

        let decoded: TokenFormat;
        try {
            decoded = this.verifyToken(token);
        } catch (err) {
            this.logger.info('Invalid token', err);
            socket.disconnect();
            return;
        }

        const { lobbyId, userId, game } = decoded;
        const lobby = await this.storage.lobbies(game).item(lobbyId).get();
        if (!lobby) {
            this.logger.info('Lobby not found', {lobbyId, lobby, lobbies: this.lobbies.keys()});
            socket.disconnect();
            return;
        }

        const user = await this.storage.participants(lobbyId).item(userId).get();
        if (!user) {
            this.logger.info('User not found', {lobbyId, lobby, lobbies: this.lobbies.keys()});
            socket.disconnect();
            return;
        }

        user.lastConnected = Date.now();
        user.connected = true;
        await this.storage.participants(lobbyId).item(user.id).set(user);

        if (!this.lobbies.has(lobbyId)) {
            this.lobbies.set(lobbyId, new LobbyController());
        }

        const controller = this.lobbies.get(lobbyId);
        controller.sockets.set(userId, socket);

        await this.updateLobby(lobby);

        socket.on('disconnect', async () => {
            const controller = this.lobbies.get(lobbyId);
            controller.sockets.delete(userId);

            const user = await this.storage.participants(lobbyId).item(userId).get();
            if (!user) return;

            user.connected = false;
            await this.storage.participants(lobbyId).item(userId).set(user);

            // If everyone is disconnected, close the lobby entirely

            const users = await this.storage.participants(lobbyId).entries();
            const connectedUsers = Array.from(users.values()).filter(p => p.connected);
            if (connectedUsers.length === 0) {
                await this.deleteLobby(game, lobbyId);
                return;
            }

            // Otherwise, update the lobby and schedule an autokick
            await this.updateLobby(lobby);

            const payload: AutoKickTaskPayload = {
                lobbyId: lobby.id,
                userId: userId,
                lastConnected: user.lastConnected,
                game,
            };

            this.taskQueue.schedule({
                scheduledTime: Date.now() + MAX_DISCONNECTION_TIME,
                type: 'auto-kick',
                payload,
            });
        });
        socket.on('message', (message) => this.onMessageReceived(game, lobbyId, userId, message));
    }

    private async onMessageReceived(game: string, lobbyId: string, fromUserId: string, message: AnyMessage) {
        this.logger.info(`onMessage`, {fromUserId, message});
        switch (message.type) {
        case 'text-message': 
            {
                message.fromUserId = fromUserId;
                const controller = this.lobbies.get(lobbyId);
                if (!controller) return;
                for (const socket of controller.sockets.values()) {
                    socket.emit('message', message);
                }
            }
            break;
        case 'data':
            {
                message.fromUserId = fromUserId;
                const controller = this.lobbies.get(lobbyId);
                if (!controller) return;
                const socket = controller.sockets.get(message.toUserId);
                if (!socket) return;
                socket.emit('message', message);
            }
            break;
        case 'set-metadata':
            {
                const lobby = await this.storage.lobbies(game).item(lobbyId).get();
                if (message.userId !== fromUserId && fromUserId !== lobby.leader) return;
                const participant = await this.storage.participants(lobbyId).item(message.userId).get();
                if (!participant) return;
                participant.metadata[message.key] = message.value;
                await this.storage.participants(lobby.id).item(participant.id).set(participant);
                await this.updateLobby(lobby);
            }
            break;
        case 'status-message':
            {
                const lobby = await this.storage.lobbies(game).item(lobbyId).get();
                if (lobby?.leader !== fromUserId) return;

                const controller = this.lobbies.get(lobbyId);
                if (!controller) return;
                for (const socket of controller.sockets.values()) {
                    socket.emit('message', message);
                }
            }
            break;
        }
    }

    private async updateLobby(lobby: LobbyDetails) {
        lobby.lastUpdate = Date.now();
        await this.storage.lobbies(lobby.game).item(lobby.id).set(lobby);
        await this.notifyLobbyUpdated(lobby.game, lobby.id);
    }

    private async lobby(game: string, lobbyId: string): Promise<Lobby> {
        const lobby = await this.storage.lobbies(game).item(lobbyId).get();
        if (!lobby) {
            throw new Error('Lobby not found');   
        }

        const participants = await this.storage.participants(lobbyId).entries();
        return {
            id: lobby.id,
            game: game,
            displayName: lobby.displayName,
            leader: lobby.leader,
            maxParticipants: lobby.maxParticipants,
            participants: Array.from(participants.values()),
            created: lobby.created,
            lastUpdate: lobby.lastUpdate,
        };
    }

    private async notifyLobbyUpdated(game: string, lobbyId: string) {
        const lobby = await this.lobby(game, lobbyId);

        const controller = this.lobbies.get(lobby.id);
        if (!controller) return;
        for (const socket of controller.sockets.values()) {
            socket.emit('message', {
                'type': 'lobby-updated',
                lobby,
            } as LobbyUpdated);
        }
    }

    private async deleteLobby(game: string, lobbyId: string) {
        await this.storage.lobbies(game).item(lobbyId).delete();

        const controller = this.lobbies.get(lobbyId);
        if (controller) {
            for (const socket of controller.sockets.values()) {
                socket.disconnect();
            }
            this.lobbies.delete(lobbyId);
        }
    }

    private async leaveLobby(lobby: LobbyDetails, userId: string) {
        await this.storage.participants(lobby.id).item(userId).delete();

        const newParticipantIds = await this.storage.participants(lobby.id).keys();
        if (newParticipantIds.length === 0) {
            await this.deleteLobby(lobby.game, lobby.id);
        } else {
            // Transfer ownership of the lobby
            if (lobby.leader === userId) {
                lobby.leader = newParticipantIds[0];
            }

            await this.updateLobby(lobby);
        }

        this.lobbies.get(lobby.id)?.sockets?.get(userId)?.disconnect();
    }
}
