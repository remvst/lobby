export interface SocketController {
    handshake: {query: {[key:string]: string}};
    send(message: any): void;
    disconnect(): void;
    onMessage(listener: (message: any) => void): void;
    onDisconnect(listener: () => void): void;
}
