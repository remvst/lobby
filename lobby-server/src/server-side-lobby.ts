import { Lobby } from "../../shared/lobby";
import { AnyMessage } from "../../shared/message";
import { NotFoundError } from "./http-error";
import { LobbyService } from "./lobby-service";
import ServerSideSocket from "./server-side-socket";

export default class ServerSideLobby {

    userId: string;
    lobby: Lobby;
    serverSocket: ServerSideSocket;
    token: string;

    onMessageFromService: (message: AnyMessage) => void = () => {};

    constructor(
        readonly service: LobbyService,
    ) {

    }

    async create(opts: {
        readonly game: string,
        readonly lobbyDisplayName: string,
        readonly playerDisplayName: string,
    }) {
        // Create the lobby
        const { lobby, token, user } = await this.service.create({
            game: opts.game,
            lobbyDisplayName: opts.lobbyDisplayName,
            playerDisplayName: opts.playerDisplayName,
        });

        this.lobby = lobby;
        this.userId = user.id;
        this.token = token;

        await this.service.setMetadata({
            game: this.lobby.game,
            lobbyId: this.lobby.id,
            userId: this.userId,
            key: '!server',
            value: true,
        });

        // Create a fake socket that will always be connected to the service
        this.serverSocket = new ServerSideSocket(token);
        this.serverSocket.sendFromServiceListener = (message: AnyMessage) => {
            if (message.type === 'lobby-updated') {
                this.lobby = message.lobby;
            }
            this.onMessageFromService(message);
        };
        this.service.onNewConnection(this.serverSocket);
    }

    async tearDown() {
        await this.service.destroy({
            token: this.token,
        });
        this.lobby = null;
        this.token = null;
        this.userId = null;
        this.serverSocket = null;
    }

    async broadcastDataMessage(data: any) {
        for (const { id, connected } of this.lobby.participants) {
            // Don't send updates to ourselves
            if (id === this.userId) continue;
            if (!connected) continue;

            try {
                await this.service.sendDataMessage({
                    game: this.lobby.game,
                    lobbyId: this.lobby.id,
                    fromUserId: this.userId,
                    toUserId: id,
                    data: data
                });
            } catch (err) {
                if (err instanceof NotFoundError) {
                    console.error(`Player ${id} is disconnected`);
                } else {
                    throw err;
                }
            }
        }
    }
}
