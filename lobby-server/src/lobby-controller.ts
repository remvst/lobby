import { Socket } from "socket.io";
import { AnyMessage } from "../../shared/message";
import { Lobby } from "../../shared/lobby";
import Logger, { createLogger } from 'bunyan';
import { User } from "../../shared/api";

class UserHolder {
    socket: Socket;
    lastActive: number = 0;

    constructor(readonly user: User) {
    }
}

export class LobbyController {

    private readonly logger: Logger;

    private readonly users = new Map<string, UserHolder>();
    readonly lobby: Lobby;

    onClose: () => void;

    constructor(options: {
        readonly id: string,
        readonly displayName: string,
    }) {
        this.lobby = {
            'id': options.id,
            'displayName': options.displayName,
            'leader': undefined,
            'participants': [],
        };

        this.logger = createLogger({name: `lobby-controller-${this.lobby.id}`});
    }
    
    add(user: User, socket: Socket) {
        this.logger.info(`Adding`, { user });

        if (!this.users.has(user.id)) {
            this.users.set(user.id, new UserHolder(user));
        }

        const userHolder = this.users.get(user.id)!;
        userHolder.lastActive = Date.now();
        userHolder.socket = socket;

        this.lobby.participants = Array.from(this.users.values()).map(holder => holder.user);
        if (!this.lobby.leader) {
            this.lobby.leader = user.id;
        }

        this.notifyLobbyUpdated();
    }

    setSocket(userId: string, socket: Socket) {
        const userHolder = this.users.get(userId)!;
        if (!userHolder) {
            return;
        }

        userHolder.socket = socket;
        userHolder.user.lastConnected = Date.now();
        socket.on('disconnect', () => this.remove(userId));
        socket.on('message', (message) => this.onMessage(userId, message));

        this.notifyLobbyUpdated();
    }

    remove(userId: string) {
        this.logger.info(`Removing ${userId}`);

        const user = this.users.get(userId);
        if (!user) return;

        user?.socket?.disconnect();
        this.users.delete(userId);
        this.lobby.participants = Array.from(this.users.values()).map(holder => holder.user);

        if (userId === this.lobby.leader) {
            this.close();
        } else {
            this.notifyLobbyUpdated();
        }
    }

    send(toUserId: string, message: AnyMessage) {
        const socket = this.users.get(toUserId)?.socket;
        if (!socket) return;
        socket.emit('msg', message);
    }

    broadcast(message: AnyMessage) {
        for (const userHolder of this.users.values()) {
            this.send(userHolder.user.id, message);
        }
    }

    private close() {
        this.logger.info(`Closing lobby`);
        this.onClose();
        this.broadcast({
            'type': 'lobby-closed',
            'lobbyId': this.lobby.id,
        });
    }

    private notifyLobbyUpdated() {
        this.broadcast({
            'type': 'lobby-updated',
            'lobby': this.lobby,
        });
    }

    private onMessage(fromUserId: string, message: AnyMessage) {
        this.logger.info(`onMessage`, {fromUserId, message});
        switch (message.type) {
        case 'text-message':
            message.fromUserId = fromUserId;
            this.broadcast(message);
            break;
        case 'data':
            message.fromUserId = fromUserId;
            this.send(message.toUserId, message);
            break;
        case 'set-metadata':
            const userHolder = this.users.get(message.userId);
            if (userHolder) {
                userHolder.user.metadata[message.key] = message.value;
            }
            this.notifyLobbyUpdated();
            break;
        }
    }
}