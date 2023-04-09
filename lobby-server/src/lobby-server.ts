import { Server, Socket } from "socket.io";
import { LobbyController } from "./lobby-controller";
import { CreateLobbyRequest, CreateLobbyResponse, JoinLobbyRequest, JoinLobbyResponse } from '../../shared/api';
import Logger, { createLogger } from "bunyan";
import http from 'http';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { TokenFormat } from "./token";

export default class LobbyServer {

    private readonly logger: Logger;
    private readonly lobbies = new Map<string, LobbyController>();

    constructor(private readonly options: {
        secretKey: string,   
    }) {
        this.logger = createLogger({name: `lobby-server`});
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

        app.get('/lobbies', (_, res) => {
            res.json({'lobbies': Array.from(this.lobbies.values()).map(lobbyController => lobbyController.lobby)});
        });

        app.post('/create', (req, res) => {
            const request: CreateLobbyRequest = req.body;

            if (!request.lobbyDisplayName || !request.playerDisplayName) {
                res.status(400).json({'reason': 'Missing parameter'});
                return;
            }

            const userId = uuidv4();
            const lobbyId = uuidv4();
            const token = jwt.sign({
                data: { userId, lobbyId } as TokenFormat
            }, this.options.secretKey);

            const lobbyController = new LobbyController({ 
                id: lobbyId,
                displayName: request.lobbyDisplayName,
            });
            lobbyController.add({
                id: userId,
                displayName: request.playerDisplayName,
                lastConnected: null,
                metadata: {},
            }, null);
            lobbyController.onClose = () => this.lobbies.delete(lobbyId);
            this.lobbies.set(lobbyId, lobbyController);

            console.log(Array.from(this.lobbies.entries()));

            res.json({
                token,
                userId,
                lobby: lobbyController.lobby,
            } as CreateLobbyResponse);
        });

        app.post('/join', (req, res) => {
            const request: JoinLobbyRequest = req.body;

            if (!request.playerDisplayName) {
                res.status(400).json({'reason': 'Missing parameter'});
                return;
            }

            const { lobbyId } = request;

            const lobbyController = this.lobbies.get(lobbyId);
            if (!lobbyController) {
                res.status(400).json({'reason': 'Lobby not found'});
                return;
            }

            const userId = uuidv4();

            lobbyController.add({
                id: userId,
                displayName: request.playerDisplayName,
                lastConnected: null,
                metadata: {},
            }, null);

            const token = jwt.sign({
                data: { userId, lobbyId } as TokenFormat
            }, this.options.secretKey);

            res.json({
                token,
                userId,
                lobby: lobbyController.lobby,
            } as JoinLobbyResponse);
        });

        this.logger.info(`Starting lobby-server on port ${port}`);

        server.listen(port, () => this.logger.info(`Ready`));
    }

    private onNewConnection(socket: Socket) {
        const { query } = socket.handshake;
        const { token } = query as {[key: string]: string};

        let decoded;
        try {
            decoded = jwt.verify(token, this.options.secretKey);
        } catch (err) {
            this.logger.info('Invalid token', err);
            socket.disconnect();
            return;
        }

        this.logger.info('New connection', { token, decoded });

        const { lobbyId, userId } = decoded.data as TokenFormat;
        const lobby = this.lobbies.get(lobbyId);
        if (!lobby) {
            this.logger.info('Lobby not found', {lobbyId, lobby, lobbies: this.lobbies.keys()});
            socket.disconnect();
            return;
        }

        lobby.setSocket(userId, socket);
    }
}