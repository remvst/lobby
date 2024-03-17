import { ServiceApi } from "../../shared/api";
import { AnyMessage } from "../../shared/message";

export interface ClientSideSocket {
    send(payload: AnyMessage): void;
    disconnect(): Promise<void>;
}

export interface ClientSideServiceApi extends ServiceApi {
    connect(options: {
        readonly token: string;
        readonly onDisconnect: () => void;
        readonly onMessage: (message: AnyMessage) => void;
    }): Promise<ClientSideSocket>;
}
