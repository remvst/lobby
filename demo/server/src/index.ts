import { LobbyServer, RedisStorage } from '@remvst/lobby-server';
import { RedisMemoryServer } from 'redis-memory-server';
import { createClient } from 'redis';
import express from 'express';
import http from 'http';

(async () => {
    const redisServer = new RedisMemoryServer();

    const host = await redisServer.getHost();
    const port = await redisServer.getPort();

    const redisClient = createClient({
        socket: { host, port },
    });
    await redisClient.connect();

    const app = express();
    const server = http.createServer(app);

    const lobbyServer = new LobbyServer({
        'secretKey': 'zeesecret',
        'storage': new RedisStorage(redisClient),
    });
    lobbyServer.setup(server, app);

    console.log(`Starting lobby-server on port ${port}`);
    server.listen(9000, () => console.log(`Ready`));   
})();
