import { LobbyHttpServer, LobbyService, RedisStorage, ServerSideLobby } from '@remvst/lobby-server';
import { RedisMemoryServer } from 'redis-memory-server';
import { createClient } from 'redis';
import express from 'express';
import http from 'http';
import cors from 'cors';

async function setupServerSideLobby(service: LobbyService) { 
    const lobby = new ServerSideLobby(service);
    await lobby.create({
        game: 'lobby-demo',
        lobbyDisplayName: 'Server-side lobby',
        playerDisplayName: '!server',
    });

    // Game updates
    let updateId = 0;
    setInterval(async () => {
        await lobby.broadcastDataMessage({ 
            'updateId': updateId++,
        });
    }, 2000);
}

(async () => {
    // Initialize redis
    const redisClient = await (async () => {
        const redisServer = new RedisMemoryServer();

        const host = await redisServer.getHost();
        const port = await redisServer.getPort();

        const redisClient = createClient({
            socket: { host, port },
        });
        await redisClient.connect();
        return redisClient;
    })();

    const app = express();
    app.use(cors());

    const server = http.createServer(app);

    const service = new LobbyService({
        'secretKey': 'zeesecret',
        'storage': new RedisStorage(redisClient),
        'maxLobbyParticipants': 6,
    });

    new LobbyHttpServer(service, server, app);

    setupServerSideLobby(service);

    const HTTP_PORT = 9000;
    console.log(`Starting lobby-server on port ${HTTP_PORT}`);
    server.listen(HTTP_PORT, () => console.log(`Ready`));  
})();
