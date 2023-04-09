import { Socket } from "socket.io";

export class LobbyController {
    readonly sockets = new Map<string, Socket>();
}