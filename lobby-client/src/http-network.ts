import { io, Socket } from "socket.io-client";
import {
    CreateLobbyRequest,
    CreateLobbyResponse,
    ErrorResponse,
    JoinLobbyRequest,
    JoinLobbyResponse,
    LeaveLobbyRequest,
    LeaveLobbyResponse,
    ListLobbiesRequest,
    ListLobbiesResponse,
    PingRequest,
    PingResponse,
} from "../../shared/api";
import { AnyMessage } from "../../shared/message";
import { ClientSideServiceApi, ClientSideSocket } from "./network";

export class HttpServerApi implements ClientSideServiceApi {
    constructor(readonly url: string) {}

    async callApi<ResponseType>(
        path: string,
        extraInit: RequestInit,
    ): Promise<ResponseType> {
        const req = new Request(this.url + path, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            ...extraInit,
        });
        const resp = await fetch(req);
        if (!resp.ok) {
            let message = `API ${req.method} ${req.url} returned error code ${resp.status}`
            try {
                const errorResponse = await resp.json() as ErrorResponse;
                if (errorResponse) message = errorResponse.reason;
            } catch (err) {}
            throw new Error(message);
        }
        return await resp.json();
    }

    listLobbies(request: ListLobbiesRequest): Promise<ListLobbiesResponse> {
        return this.callApi(
            `/lobbies?` + new URLSearchParams(request as any).toString(),
            {
                method: "GET",
            },
        );
    }

    join(request: JoinLobbyRequest): Promise<JoinLobbyResponse> {
        return this.callApi(`/join`, {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    create(request: CreateLobbyRequest): Promise<CreateLobbyResponse> {
        return this.callApi(`/create`, {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    leave(request: LeaveLobbyRequest): Promise<LeaveLobbyResponse> {
        return this.callApi(`/leave`, {
            method: "POST",
            body: JSON.stringify(request),
        });
    }

    async connect(options: {
        readonly token: string;
        readonly onDisconnect: () => void;
        readonly onMessage: (message: any) => void;
    }): Promise<ClientSideSocket> {
        const socket = new HttpSocket(
            this.url,
            options.token,
            options.onDisconnect,
            options.onMessage,
        );
        await socket.connect();
        return socket;
    }

    ping(request: PingRequest): Promise<PingResponse> {
        return this.callApi("/ping", { method: "POST" });
    }
}

export class HttpSocket implements ClientSideSocket {
    private readonly socket: Socket;
    private readonly onDisconnected: () => void;

    constructor(
        url: string,
        token: string,
        onDisconnected: () => void,
        onMessage: (message: any) => void,
    ) {
        this.socket = io(url, {
            reconnection: false,
            query: {
                token,
            },
        });
        this.socket.on("message", (message) => onMessage(message));

        this.onDisconnected = onDisconnected;
    }

    send(payload: AnyMessage): void {
        this.socket.emit("message", payload);
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket.on("connect", resolve);
            this.socket.on("disconnect", () => {
                this.onDisconnected();
                reject();
            });
            this.socket.on("connect_error", reject);
            this.socket.on("connect_timeout", reject);
            this.socket.connect();
        });
    }

    async disconnect(): Promise<void> {
        this.socket.disconnect();
    }
}
