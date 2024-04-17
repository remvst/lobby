import express from "express";
import http from "http";
import { Server, Socket, ServerOptions } from "socket.io";
import {
    CreateLobbyRequest,
    CreateLobbyResponse,
    ErrorResponse,
    JoinLobbyRequest,
    JoinLobbyResponse,
    KickFromLobbyRequest,
    KickFromLobbyResponse,
    LeaveLobbyRequest,
    LeaveLobbyResponse,
    ListLobbiesRequest,
    ListLobbiesResponse,
    PingRequest,
    PingResponse,
} from "../../shared/api";
import { HttpError } from "./http-error";
import { LobbyService } from "./lobby-service";
import { SocketIOWrapper } from "./socket-io-wrapper";

export class LobbyHttpServer {
    constructor(
        protected readonly service: LobbyService,
        protected readonly server: http.Server,
        protected readonly app: any,
        serverOptions: Partial<ServerOptions> = {},
    ) {
        const io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"],
            },
            pingInterval: 10000,
            pingTimeout: 5000,
            ...serverOptions,
        });
        app.use(express.json());

        io.on("connection", (socket: Socket) => {
            this.service.onNewConnection(new SocketIOWrapper(socket));
        });

        app.get(
            "/lobbies",
            this.responder<ListLobbiesRequest, ListLobbiesResponse>((request) =>
                this.service.listLobbies(request),
            ),
        );
        app.post(
            "/leave",
            this.responder<LeaveLobbyRequest, LeaveLobbyResponse>((request) =>
                this.service.leave(request),
            ),
        );
        app.post(
            "/kick",
            this.responder<KickFromLobbyRequest, KickFromLobbyResponse>(
                (request) => this.service.kick(request),
            ),
        );
        app.post(
            "/create",
            this.responder<CreateLobbyRequest, CreateLobbyResponse>((request) =>
                this.service.create(request),
            ),
        );
        app.post(
            "/join",
            this.responder<JoinLobbyRequest, JoinLobbyResponse>((request) =>
                this.service.join(request),
            ),
        );
        app.post(
            "/ping",
            this.responder<PingRequest, PingResponse>((request) =>
                this.service.ping(request),
            ),
        );
    }

    protected responder<RequestType, ResponseType>(
        getResponse: (request: RequestType) => Promise<ResponseType>,
    ): (req: any, res: any) => void {
        return async (req, res) => {
            const request: RequestType =
                req.method === "POST" ? req.body : req.query;

            let response: ResponseType;
            try {
                response = await getResponse(request);
                res.status(200).json(response);
            } catch (e) {
                if (e instanceof HttpError) {
                    res.status(e.statusCode);
                } else {
                    res.status(500);
                }

                const response: ErrorResponse = {
                    reason: e.message,
                };
                res.json(response);
            }
        };
    }
}
