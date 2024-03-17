import { SocketController } from "./socket-controller";

export class LobbyController {
    readonly sockets = new Map<string, SocketController>();
}
