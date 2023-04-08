import { Socket } from "socket.io";
import { AnyMessage } from "../../shared/message";
import { Lobby } from "../../shared/lobby";
import Logger, { createLogger } from 'bunyan';

class User {
    socket: Socket;
    lastActive: number = 0;

    constructor(readonly id: string) {
    }
}

export class LobbyController {

    private readonly logger: Logger;

    private readonly users = new Map<string, User>();
    private readonly lobby: Lobby;

    onClose: () => void;

    constructor(id: string) {
        this.lobby = {
            'id': id,
            'leader': undefined,
            'participants': [],
        };

        this.logger = createLogger({name: `lobby-controller-${id}`});
    }
    
    add(userId: string, socket: Socket) {
        this.logger.info(`Adding ${userId}`);

        if (!this.users.has(userId)) {
            this.users.set(userId, new User(userId));
        }

        const user = this.users.get(userId)!;
        user.lastActive = Date.now();
        user.socket = socket;

        this.lobby.participants = Array.from(this.users.keys());
        if (!this.lobby.leader) {
            this.lobby.leader = userId;
        }

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
        this.lobby.participants = this.lobby.participants.filter(id => id !== userId);

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
        console.log(toUserId, message);
    }

    broadcast(message: AnyMessage) {
        for (const user of this.users.values()) {
            this.send(user.id, message);
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
            console.log('its data');
            message.fromUserId = fromUserId;
            this.send(message.toUserId, message);
            break;
        }
    }
}