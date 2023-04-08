import { Socket } from "socket.io";
import { AnyMessage } from "../../shared/message";
import { Lobby } from "../../shared/lobby";

class User {
    socket: Socket;
    lastActive: number = 0;

    constructor(readonly id: string) {
    }
}

export class LobbyController {

    private readonly users = new Map<string, User>();
    private readonly lobby: Lobby;

    onClose: () => void;

    constructor(id: string) {
        this.lobby = {
            'id': id,
            'leader': undefined,
            'participants': [],
        };
    }
    
    add(userId: string, socket: Socket) {
        console.log(`Adding ${userId}`);

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

        this.notifyLobbyUpdated();
    }

    remove(userId: string) {
        console.log(`Removing ${userId}`);

        const user = this.users.get(userId);
        if (!user) return;

        user?.socket?.disconnect();
        this.users.delete(userId);

        if (userId === this.lobby.leader) {
            console.log(`Closing lobby ${this.lobby.id}`);
            this.close();
        } else {
            this.notifyLobbyUpdated();
        }
    }

    send(toUserId: string, message: AnyMessage) {
        const socket = this.users.get(toUserId)?.socket;
        if (!socket) return;
        socket.send('msg', message);
    }

    broadcast(message: AnyMessage) {
        for (const user of this.users.values()) {
            this.send(user.id, message);
        }
    }

    private close() {
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
}