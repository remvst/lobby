import { Socket } from "socket.io";
import { SocketController } from "../../shared/socket-controller";

export default class SocketIOWrapper implements SocketController {
    handshake = this.io.handshake as {query: {[key:string]: string}};
    
    constructor(private readonly io: Socket) {

    }

    send(message: any): void {
        this.io.emit('message', message);
    }

    disconnect(): void {
        this.io.disconnect();
    }

    onMessage(listener: (message: any) => void): void {
        this.io.on('message', listener);
    }

    onDisconnect(listener: () => void): void {
        this.io.on('disconnect', listener);
    }
}
