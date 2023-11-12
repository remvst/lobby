import { SocketController } from "../../shared/socket-controller";

export default class ServerSideSocket implements SocketController {
    handshake: {query: {[key:string]: string}} = {
        query: {
            token: this.token,
        },
    };

    sendFromServiceListener: (message: any) => void = () => {};
    sendToServiceListener: (message: any) => void = () => {};
    onDisconnectListener: () => void;

    constructor(readonly token: string) {

    }

    send(message: any) {
        this.sendFromServiceListener(message);
    }

    disconnect() {
        this.onDisconnectListener();
    }

    onMessage(listener: (message: any) => void) {
        this.sendToServiceListener = listener;
    }

    onDisconnect(listener: () => void) {
        this.onDisconnectListener = listener;
    }
}
