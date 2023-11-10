import { SocketController } from "../../shared/socket-controller";

export class LobbyController {
    readonly sockets = new Map<string, SocketController>();
}
