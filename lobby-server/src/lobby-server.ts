import { Server, Socket } from "socket.io";
import { LobbyController } from "./lobby-controller";
import { CreateLobbyRequest, CreateLobbyResponse, JoinLobbyRequest, JoinLobbyResponse, LeaveLobbyRequest, LeaveLobbyResponse, ListLobbiesRequest, User } from '../../shared/api';
import { createLogger } from "bunyan";
import http from 'http';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { TokenFormat } from "./token";
import TaskQueue from "./task-queue";
import { AutoKickTaskPayload } from "./task-params";
import { Storage } from './storage';
import { AnyMessage, LobbyUpdated } from "../../shared/message";
import { Lobby } from "../../shared/lobby";

const MAX_DISCONNECTION_TIME = 15000;

export default class LobbyServer {

    private readonly logger = createLogger({name: `lobby-server`});
    private readonly lobbies = new Map<string, LobbyController>();
    private readonly taskQueue = new TaskQueue();
    private readonly storage: Storage;

    constructor(private readonly options: {
        secretKey: string,   
        storage: Storage,
    }) {
        this.storage = options.storage;

        this.taskQueue.defineExecutor<AutoKickTaskPayload>('auto-kick', async payload => {
            const { lobbyId, userId } = payload;
            const lobby = await this.storage.getLobby(lobbyId);
            if (!lobby) return;

            const user = lobby.participants.find(p => p.id === userId);
            if (!user || user.lastConnected !== payload.lastConnected) return;

            this.logger.info('Autokicking', { lobbyId, userId });

            await this.leaveLobby(lobby, userId);
        });
    }

    start(port: number) {
        const app = express();
        app.use(cors())

        const server = http.createServer(app);

        const io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
        });
        app.use(cors());
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

            const lobbies = await this.storage.getLobbies(game);
            res.json({ lobbies });
        });

        app.post('/leave', async (req, res) => {
            const request: LeaveLobbyRequest = req.body;
            const { token } = request;

            let decoded;
            try {
                decoded = jwt.verify(token, this.options.secretKey);
            } catch (err) {
                res.status(400).json({'reason': 'Invalid token'});
                return;
            }

            const { lobbyId, userId } = decoded.data as TokenFormat;
            const lobby = await this.storage.getLobby(lobbyId);
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

            const lobby: Lobby = {
                id: uuidv4(),
                displayName: lobbyDisplayName,
                leader: user.id,
                game: game,
                maxParticipants: 8, // hardcode for now
                participants: [user],
                created: Date.now(),
                lastUpdate: Date.now(),
            };

            await this.updateLobby(lobby);

            const token = jwt.sign({
                data: { userId: user.id, lobbyId: lobby.id } as TokenFormat
            }, this.options.secretKey);

            this.taskQueue.schedule({
                scheduledTime: Date.now() + MAX_DISCONNECTION_TIME,
                type: 'auto-kick',
                payload: {
                    lobbyId: lobby.id,
                    userId: user.id,
                    lastConnected: user.lastConnected,
                } as AutoKickTaskPayload,
            });

            res.json({ token, user, lobby } as CreateLobbyResponse);
        });

        app.post('/join', async (req, res) => {
            const request: JoinLobbyRequest = req.body;
            const { playerDisplayName, lobbyId } = request;

            if (!playerDisplayName) {
                res.status(400).json({'reason': 'Missing parameter'});
                return;
            }

            const lobby = await this.storage.getLobby(lobbyId);
            if (!lobby) {
                res.status(404).json({'reason': 'Lobby not found'});
                return;
            }

            if (lobby.participants.length >= lobby.maxParticipants) {
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
            lobby.participants.push(user);

            await this.updateLobby(lobby);

            this.taskQueue.schedule({
                scheduledTime: Date.now() + MAX_DISCONNECTION_TIME,
                type: 'auto-kick',
                payload: {
                    lobbyId: lobby.id,
                    userId: user.id,
                    lastConnected: user.lastConnected,
                } as AutoKickTaskPayload,
            });

            const token = jwt.sign({
                data: { userId: user.id, lobbyId } as TokenFormat
            }, this.options.secretKey);

            res.json({
                token,
                user,
                lobby,
            } as JoinLobbyResponse);
        });

        this.logger.info(`Starting lobby-server on port ${port}`);

        server.listen(port, () => this.logger.info(`Ready`));
    }

    private async onNewConnection(socket: Socket) {
        const { query } = socket.handshake;
        const { token } = query as {[key: string]: string};

        this.logger.info('New connection', { token });

        let decoded;
        try {
            decoded = jwt.verify(token, this.options.secretKey);
        } catch (err) {
            this.logger.info('Invalid token', err);
            socket.disconnect();
            return;
        }

        const { lobbyId, userId } = decoded.data as TokenFormat;
        const lobby = await this.storage.getLobby(lobbyId);
        if (!lobby) {
            this.logger.info('Lobby not found', {lobbyId, lobby, lobbies: this.lobbies.keys()});
            socket.disconnect();
            return;
        }

        const user = lobby.participants.find(p => p.id === userId);
        if (!user) {
            socket.disconnect();
            return;
        }

        user.lastConnected = Date.now();
        user.connected = true;

        if (!this.lobbies.has(lobbyId)) {
            this.lobbies.set(lobbyId, new LobbyController());
        }

        const controller = this.lobbies.get(lobbyId);
        controller.sockets.set(userId, socket);

        await this.updateLobby(lobby);

        socket.on('disconnect', async () => {
            const controller = this.lobbies.get(lobbyId);
            controller.sockets.delete(userId);

            const lobby = await this.storage.getLobby(lobbyId);
            const user = lobby.participants.find(p => p.id === userId);
            user.connected = false;
            if (!user) return;

            // If everyone is disconnected, close the lobby entirely
            const connectedUsers = lobby.participants.filter(p => p.connected);
            if (connectedUsers.length === 0) {
                await this.deleteLobby(lobbyId);
                return;
            }

            // Otherwise, update the lobby and schedule an autokick
            await this.updateLobby(lobby);

            this.taskQueue.schedule({
                scheduledTime: Date.now() + MAX_DISCONNECTION_TIME,
                type: 'auto-kick',
                payload: {
                    lobbyId: lobby.id,
                    userId: userId,
                    lastConnected: user.lastConnected,
                } as AutoKickTaskPayload,
            });
        });
        socket.on('message', (message) => this.onMessageReceived(lobbyId, userId, message));
    }

    private async onMessageReceived(lobbyId: string, fromUserId: string, message: AnyMessage) {
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
                const lobby = await this.storage.getLobby(lobbyId);
                if (message.userId !== fromUserId && fromUserId !== lobby.leader) return;
                const user = lobby?.participants?.find(p => p.id === message.userId);
                if (!user) return;
                user.metadata[message.key] = message.value;
                this.updateLobby(lobby);
            }
            break;
        case 'status-message':
            {
                const lobby = await this.storage.getLobby(lobbyId);
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

    private async updateLobby(lobby: Lobby) {
        lobby.lastUpdate = Date.now();
        await this.storage.updateLobby(lobby);
        await this.notifyLobbyUpdated(lobby);    
    }

    private async notifyLobbyUpdated(lobby: Lobby) {
        const controller = this.lobbies.get(lobby.id);
        if (!controller) return;
        for (const socket of controller.sockets.values()) {
            socket.emit('message', {
                'type': 'lobby-updated',
                lobby,
            } as LobbyUpdated);
        }
    }

    private async deleteLobby(lobbyId: string) {
        await this.storage.deleteLobby(lobbyId);

        const controller = this.lobbies.get(lobbyId);
        if (controller) {
            for (const socket of controller.sockets.values()) {
                socket.disconnect();
            }
            this.lobbies.delete(lobbyId);
        }
    }

    private async leaveLobby(lobby: Lobby, userId: string) {
        lobby.participants = lobby.participants.filter(p => p.id !== userId);

        if (!lobby.participants.length) {
            await this.deleteLobby(lobby.id);
        } else {
            // Transfer ownership of the lobby
            if (lobby.leader === userId) {
                lobby.leader = lobby.participants[0].id;
            }

            await this.updateLobby(lobby);
        }

        this.lobbies.get(lobby.id)?.sockets?.get(userId)?.disconnect();
    }
}