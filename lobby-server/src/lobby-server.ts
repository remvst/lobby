import { Server, Socket } from "socket.io";
import { LobbyController } from "./lobby-controller";

export default class LobbyServer {

    private readonly lobbies = new Map<string, LobbyController>();

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

        console.log(`Starting lobby-server on port ${port}`);

        io.listen(port);
    }

    private onNewConnection(socket: Socket) {
        console.log('new connection', socket.handshake);
        console.log('userId', socket.handshake.query.userId);
        console.log('lobbyId', socket.handshake.query.lobbyId);

        const { query } = socket.handshake;
        const { userId, lobbyId } = query as {[key: string]: string};

        if (!userId || !lobbyId) {
            console.log('Missing userId or lobbyId');
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