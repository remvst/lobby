import { Server, Socket } from "socket.io";
import { LobbyController } from "./lobby-controller";
import Logger, { createLogger } from "bunyan";

export default class LobbyServer {

    private readonly logger: Logger;
    private readonly lobbies = new Map<string, LobbyController>();

    constructor() {
        this.logger = createLogger({name: `lobby-server`});
    }

    start(port: number) {
        const io = new Server({
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
        });

        io.on("connection", (socket: Socket) => {
            this.onNewConnection(socket);
        });

        this.logger.info(`Starting lobby-server on port ${port}`);

        io.listen(port);
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