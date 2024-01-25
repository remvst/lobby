import { createLogger } from "bunyan";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import {
    CreateLobbyRequest,
    CreateLobbyResponse,
    DestroyLobbyRequest,
    DestroyLobbyResponse,
    JoinLobbyRequest,
    JoinLobbyResponse,
    LeaveLobbyRequest,
    LeaveLobbyResponse,
    ListLobbiesRequest,
    ListLobbiesResponse,
    SendDataMessageRequest,
    SendDataMessageResponse,
    SendStatusMessageRequest,
    SendStatusMessageResponse,
    SendTextMessageRequest,
    SendTextMessageResponse,
    SetMetadataRequest,
    SetMetadataResponse,
    User,
} from "../../shared/api";
import { Lobby } from "../../shared/lobby";
import {
    AnyMessage,
    DataMessage,
    LobbyUpdated,
    StatusMessage,
    TextMessage,
} from "../../shared/message";
import { SocketController } from "../../shared/socket-controller";
import { BadRequestError, ForbiddenError, NotFoundError } from "./http-error";
import { LobbyController } from "./lobby-controller";
import { LobbyDetails } from "./model/lobby-details";
import { TokenFormat } from "./model/token";
import { DefaultModerator, Moderator } from "./moderator";
import { Storage } from "./storage/storage";
import { AutoKickTaskPayload } from "./task-params";
import { TaskQueue } from "./task-queue";

const MAX_DISCONNECTION_TIME = 15000;
const ONE_SECOND = 1000;
const ONE_MINUTE = ONE_SECOND * 60;
const ONE_HOUR = ONE_MINUTE * 60;

export class LobbyService {
    private readonly logger = createLogger({ name: `lobby-service` });
    private readonly lobbies = new Map<string, LobbyController>();
    private readonly taskQueue = new TaskQueue();
    private readonly storage: Storage;
    private readonly moderator: Moderator;

    constructor(
        private readonly options: {
            readonly secretKey: string;
            readonly storage: Storage;
            readonly maxLobbyParticipants: number;
            readonly moderator?: Moderator;
        },
    ) {
        this.storage = options.storage;
        this.moderator = options.moderator || new DefaultModerator();

        this.taskQueue.defineExecutor<AutoKickTaskPayload>(
            "auto-kick",
            async (payload) => {
                const { lobbyId, userId, game } = payload;
                const lobby = await this.storage
                    .lobbies(game)
                    .item(lobbyId)
                    .get();
                if (!lobby) return;

                const participant = await this.storage
                    .participants(lobby.id)
                    .item(userId)
                    .get();
                if (
                    !participant ||
                    participant.lastConnected !== payload.lastConnected
                )
                    return;

                this.logger.info("Autokicking", { lobbyId, userId });

                await this.leaveLobby(lobby, userId);
            },
        );
    }

    async listLobbies(
        request: ListLobbiesRequest,
    ): Promise<ListLobbiesResponse> {
        const { game } = request;
        if (!game) throw new BadRequestError("Missing game parameter");

        const lobbyDetails: LobbyDetails[] = Array.from(
            (await this.storage.lobbies(game).entries()).values(),
        );

        const allLobbies = await Promise.all(
            lobbyDetails.map(async (details) => {
                const entries = await this.storage
                    .participants(details.id)
                    .entries();
                const lobby: Lobby = {
                    ...details,
                    participants: Array.from(entries.values()),
                };
                return lobby;
            }),
        );
        const lobbies = allLobbies
            .filter((lobby) => lobby.participants.length > 0)
            .filter((lobby) => Date.now() - lobby.lastUpdate < 2 * ONE_HOUR)
            .filter(
                (lobby) =>
                    lobby.participants.filter((p) => p.connected).length > 0,
            );
        const response: ListLobbiesResponse = { lobbies };

        return response;
    }

    async leave(request: LeaveLobbyRequest): Promise<LeaveLobbyResponse> {
        const { token } = request;

        let decoded: TokenFormat;
        try {
            decoded = this.verifyToken(token);
        } catch (err) {
            throw new BadRequestError("Invalid token");
        }

        const { lobbyId, userId, game } = decoded;
        const lobby = await this.storage.lobbies(game).item(lobbyId).get();
        if (!lobby) throw new NotFoundError("Lobby not found");

        await this.leaveLobby(lobby, userId);
        return {};
    }

    async destroy(request: DestroyLobbyRequest): Promise<DestroyLobbyResponse> {
        const { token } = request;

        let decoded: TokenFormat;
        try {
            decoded = this.verifyToken(token);
        } catch (err) {
            throw new BadRequestError("Invalid token");
        }

        const { lobbyId, userId, game } = decoded;
        const lobby = await this.storage.lobbies(game).item(lobbyId).get();
        if (!lobby) throw new NotFoundError("Lobby not found");
        if (lobby.leader !== userId) throw new ForbiddenError();

        const participantIds = await this.storage.participants(lobbyId).keys();
        await Promise.all(
            participantIds.map((id) => this.leaveLobby(lobby, id)),
        );
        return {};
    }

    async create(request: CreateLobbyRequest): Promise<CreateLobbyResponse> {
        let { lobbyDisplayName, playerDisplayName, game } = request;

        if (!lobbyDisplayName || !playerDisplayName || !game) {
            throw new BadRequestError("Missing parameter");
        }

        lobbyDisplayName =
            this.moderator.moderateLobbyDisplayName(lobbyDisplayName);
        playerDisplayName =
            this.moderator.moderatePlayerDisplayName(playerDisplayName);

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
            type: "auto-kick",
            payload,
        });

        return {
            token,
            user,
            lobby: await this.lobby(game, lobby.id),
        };
    }

    async join(request: JoinLobbyRequest): Promise<JoinLobbyResponse> {
        let { playerDisplayName, lobbyId, game } = request;

        if (!playerDisplayName || !lobbyId || !game) {
            throw new BadRequestError("Missing parameter");
        }

        playerDisplayName =
            this.moderator.moderatePlayerDisplayName(playerDisplayName);

        const lobby = await this.storage.lobbies(game).item(lobbyId).get();
        if (!lobby) {
            throw new NotFoundError("Lobby not found");
        }

        const participantCount = await this.storage
            .participants(lobbyId)
            .size();
        if (participantCount >= lobby.maxParticipants) {
            throw new ForbiddenError("Lobby is full");
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
            type: "auto-kick",
            payload,
        });

        const data: TokenFormat = { userId: user.id, lobbyId, game };
        const token = jwt.sign({ data }, this.options.secretKey);

        return {
            token,
            user,
            lobby: await this.lobby(game, lobby.id),
        };
    }

    verifyToken(token: string): TokenFormat {
        let decoded;
        try {
            decoded = jwt.verify(token, this.options.secretKey);
        } catch (err) {
            throw new Error("Invalid token");
        }

        return decoded.data as TokenFormat;
    }

    async onNewConnection(socket: SocketController) {
        const { query } = socket.handshake;
        const { token } = query as { [key: string]: string };

        this.logger.info("New connection", { token });

        let decoded: TokenFormat;
        try {
            decoded = this.verifyToken(token);
        } catch (err) {
            this.logger.info("Invalid token", err);
            socket.disconnect();
            return;
        }

        const { lobbyId, userId, game } = decoded;
        const lobby = await this.storage.lobbies(game).item(lobbyId).get();
        if (!lobby) {
            this.logger.info("Lobby not found", {
                lobbyId,
                lobby,
                lobbies: this.lobbies.keys(),
            });
            socket.disconnect();
            return;
        }

        const user = await this.storage
            .participants(lobbyId)
            .item(userId)
            .get();
        if (!user) {
            this.logger.info("User not found", {
                lobbyId,
                lobby,
                lobbies: this.lobbies.keys(),
            });
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

        socket.onDisconnect(async () => {
            try {
                const controller = this.lobbies.get(lobbyId);
                controller.sockets.delete(userId);

                const user = await this.storage
                    .participants(lobbyId)
                    .item(userId)
                    .get();
                if (!user) return;

                user.connected = false;
                await this.storage.participants(lobbyId).item(userId).set(user);

                // If everyone is disconnected, close the lobby entirely

                const users = await this.storage
                    .participants(lobbyId)
                    .entries();
                const connectedUsers = Array.from(users.values()).filter(
                    (p) => p.connected,
                );
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
                    type: "auto-kick",
                    payload,
                });
            } catch (err) {
                this.logger.error("onDisconnect", { err });
            }
        });
        socket.onMessage(
            async (message) =>
                await this.onMessageReceived(game, lobbyId, userId, message),
        );
    }

    async sendTextMessage(
        request: SendTextMessageRequest,
    ): Promise<SendTextMessageResponse> {
        const forwarded: TextMessage = {
            type: "text-message",
            fromUserId: request.fromUserId,
            message: request.message,
        };

        const controller = this.lobbies.get(request.lobbyId);
        if (!controller) return new NotFoundError();
        for (const socket of controller.sockets.values()) {
            socket.send(forwarded);
        }

        return {};
    }

    async sendDataMessage(
        request: SendDataMessageRequest,
    ): Promise<SendDataMessageResponse> {
        const forwarded: DataMessage = {
            type: "data",
            fromUserId: request.fromUserId,
            toUserId: request.toUserId,
            data: request.data,
        };

        const controller = this.lobbies.get(request.lobbyId);
        if (!controller) throw new NotFoundError();
        const socket = controller.sockets.get(request.toUserId);
        if (!socket) throw new NotFoundError();
        socket.send(forwarded);

        return {};
    }

    async setMetadata(
        request: SetMetadataRequest,
    ): Promise<SetMetadataResponse> {
        const lobby = await this.storage
            .lobbies(request.game)
            .item(request.lobbyId)
            .get();
        const participant = await this.storage
            .participants(request.lobbyId)
            .item(request.userId)
            .get();
        if (!participant) throw new NotFoundError();
        participant.metadata[request.key] = request.value;
        await this.storage
            .participants(lobby.id)
            .item(participant.id)
            .set(participant);
        await this.updateLobby(lobby);

        return {};
    }

    async sendStatusMessage(
        request: SendStatusMessageRequest,
    ): Promise<SendStatusMessageResponse> {
        const lobby = await this.storage
            .lobbies(request.game)
            .item(request.lobbyId)
            .get();
        if (lobby?.leader !== request.fromUserId) throw new ForbiddenError();

        const controller = this.lobbies.get(request.lobbyId);
        if (!controller) throw new NotFoundError();

        const message: StatusMessage = {
            type: "status-message",
            message: request.message,
        };
        for (const socket of controller.sockets.values()) {
            socket.send(message);
        }

        return {};
    }

    private async onMessageReceived(
        game: string,
        lobbyId: string,
        fromUserId: string,
        message: AnyMessage,
    ) {
        if (message.type !== "data") {
            this.logger.info(`onMessage`, { fromUserId, message });
        }
        try {
            switch (message.type) {
                case "text-message":
                    await this.sendTextMessage({
                        fromUserId: fromUserId,
                        message: message.message,
                        game,
                        lobbyId,
                    });
                    break;
                case "data":
                    await this.sendDataMessage({
                        toUserId: message.toUserId,
                        fromUserId: fromUserId,
                        data: message.data,
                        game,
                        lobbyId,
                    });
                    break;
                case "set-metadata":
                    await this.setMetadata({
                        userId: message.userId,
                        key: message.key,
                        value: message.value,
                        game,
                        lobbyId,
                    });
                    break;
                case "status-message":
                    await this.sendStatusMessage({
                        fromUserId: fromUserId,
                        message: message.message,
                        game,
                        lobbyId,
                    });
                    break;
            }
        } catch (err) {
            this.logger.error({ err, message, fromUserId });
        }
    }

    private async updateLobby(lobby: LobbyDetails) {
        lobby.lastUpdate = Date.now();
        await this.storage.lobbies(lobby.game).item(lobby.id).set(lobby);
        await this.notifyLobbyUpdated(lobby.game, lobby.id);
    }

    async lobby(game: string, lobbyId: string): Promise<Lobby> {
        const lobby = await this.storage.lobbies(game).item(lobbyId).get();
        if (!lobby) {
            throw new NotFoundError("Lobby not found");
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
            const update: LobbyUpdated = {
                type: "lobby-updated",
                lobby,
            };
            socket.send(update);
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

        const newParticipantIds = await this.storage
            .participants(lobby.id)
            .keys();
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
