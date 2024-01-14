import { Server, Socket } from "socket.io";
import http from 'http';
import express from 'express';
import { LobbyService } from "./lobby-service";
import SocketIOWrapper from "./socket-io-wrapper";
import { CreateLobbyRequest, CreateLobbyResponse, JoinLobbyRequest, JoinLobbyResponse, LeaveLobbyRequest, LeaveLobbyResponse, ListLobbiesRequest, ListLobbiesResponse, PingRequest, PingResponse } from "../../shared/api";
import { HttpError } from "./http-error";

export class LobbyHttpServer {

    constructor(
        protected readonly service: LobbyService,
        protected readonly server: http.Server,
        protected readonly app: any
    ) {
        const io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
        });
        app.use(express.json());

        io.on("connection", (socket: Socket) => {
            this.service.onNewConnection(new SocketIOWrapper(socket));
        });

        app.get('/lobbies', this.responder<ListLobbiesRequest, ListLobbiesResponse>((request) => this.service.listLobbies(request)));
        app.post('/leave', this.responder<LeaveLobbyRequest, LeaveLobbyResponse>((request) => this.service.leave(request)));
        app.post('/create', this.responder<CreateLobbyRequest, CreateLobbyResponse>((request) => this.service.create(request)));
        app.post('/join', this.responder<JoinLobbyRequest, JoinLobbyResponse>((request) => this.service.join(request)));
        app.post('/ping', this.responder<PingRequest, PingResponse>(async () => ({})));
    }

    protected responder<RequestType, ResponseType>(
        getResponse: (request: RequestType) => Promise<ResponseType>,
    ): (req: any, res: any) => void {
        return async (req, res) => {
            const request: RequestType = req.method === 'POST' ? req.body : req.query;

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
                res.json({'reason': e.message});
            }
        };
    }
}
