import { LobbyHttpServer, LobbyService, RedisStorage, SocketController } from '@remvst/lobby-server';
import { RedisMemoryServer } from 'redis-memory-server';
import { createClient } from 'redis';
import express from 'express';
import http from 'http';
import cors from 'cors';

class ServerHostSocket implements SocketController {
    handshake: {query: {[key:string]: string}} = {
        query: {
            token: this.token,
        },
    };

    constructor(private readonly token: string) {

    }

    send(message: any) {

    }

    disconnect() {

    }

    onMessage(listener: (message: any) => void) {

    }

    onDisconnect(listener: () => void) {
        
    }
}

(async () => {
    const redisServer = new RedisMemoryServer();

    const host = await redisServer.getHost();
    const port = await redisServer.getPort();

    const redisClient = createClient({
        socket: { host, port },
    });
    await redisClient.connect();

    const app = express();
    app.use(cors());

    const server = http.createServer(app);

    const service = new LobbyService({
        'secretKey': 'zeesecret',
        'storage': new RedisStorage(redisClient),
        'maxLobbyParticipants': 6,
    });
    
    const serverLobby = await service.create({
        game: 'lobby-demo',
        lobbyDisplayName: 'server-lobby',
        playerDisplayName: 'server!',
    });
    console.log('lobby created!', serverLobby);

    const serverSocket = new ServerHostSocket(serverLobby.token);
    service.onNewConnection(serverSocket);

    new LobbyHttpServer(service, server, app);

    console.log(`Starting lobby-server on port ${port}`);
    server.listen(9000, () => console.log(`Ready`));   
})();
