import { AnyMessage } from "../../shared/message";

export interface SocketController {
    handshake: {query: {[key:string]: string}};
    send(message: AnyMessage): void;
    disconnect(): void;
    onMessage(listener: (message: AnyMessage) => void): void;
    onDisconnect(listener: () => void): void;
}
