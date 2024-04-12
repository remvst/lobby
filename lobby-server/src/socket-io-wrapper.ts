import { Socket } from "socket.io";
import { SocketController } from "./socket-controller";

export class SocketIOWrapper implements SocketController {
    handshake = this.io.handshake as { query: { [key: string]: string } };

    constructor(private readonly io: Socket) {}

    send(message: any): void {
        this.io.emit("message", message);
    }

    disconnect(): void {
        this.io.disconnect();
    }

    onMessage(listener: (message: any) => void): void {
        this.io.on("message", listener);
    }

    onDisconnect(listener: () => void): void {
        this.io.on("disconnect", listener);
    }

    ping(): Promise<number> {
        const before = Date.now();
        return new Promise((resolve) => {
            this.io.emit("ping", () => {
                const after = Date.now();
                resolve(after - before);
            });
        });
    }
}
