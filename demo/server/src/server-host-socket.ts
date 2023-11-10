import { SocketController } from "@remvst/lobby-server";

export default class ServerHostSocket implements SocketController {
    handshake: {query: {[key:string]: string}} = {
        query: {
            token: this.token,
        },
    };

    sendFromServiceListener: (message: any) => void = () => {};
    sendToServiceListener: (message: any) => void = () => {};

    constructor(private readonly token: string) {

    }

    send(message: any) {
        this.sendFromServiceListener(message);
    }

    disconnect() {

    }

    onMessage(listener: (message: any) => void) {
        this.sendToServiceListener = listener;
    }

    onDisconnect(listener: () => void) {
        
    }
}
