import { Server, Socket } from "socket.io";
import { LobbyController } from "./lobby-controller";
import Logger, { createLogger } from "bunyan";
import http from 'http';
import express from 'express';
import cors from 'cors';

export default class LobbyServer {

    private readonly logger: Logger;
    private readonly lobbies = new Map<string, LobbyController>();

    constructor() {
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

        io.on("connection", (socket: Socket) => {
            this.onNewConnection(socket);
        });

        app.get('/lobbies', (_, res) => {
            res.json({'lobbies': Array.from(this.lobbies.values()).map(lobbyController => lobbyController.lobby)});
        });

        this.logger.info(`Starting lobby-server on port ${port}`);

        server.listen(port, () => this.logger.info(`Ready`));
    }

    private onNewConnection(socket: Socket) {
        const { query } = socket.handshake;
        const { userId, lobbyId } = query as {[key: string]: string};

        this.logger.info('New connection', { userId, lobbyId });

        if (!userId || !lobbyId) {
            this.logger.info('Missing userId or lobbyId');
            socket.disconnect();
            return;
        }

        if (!this.lobbies.has(lobbyId)) {
            this.lobbies.set(lobbyId, new LobbyController(lobbyId));
        }

        const lobby = this.lobbies.get(lobbyId)!;
        lobby.add(userId, socket);
        lobby.onClose = () => this.lobbies.delete(lobbyId);
    }
}