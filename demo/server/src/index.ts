import { LobbyServer, RedisStorage } from '@remvst/lobby-server';
import { RedisMemoryServer } from 'redis-memory-server';
import { createClient } from 'redis';

(async () => {
    const redisServer = new RedisMemoryServer();

    const host = await redisServer.getHost();
    const port = await redisServer.getPort();

    const redisClient = createClient({
        socket: { host, port },
    });
    await redisClient.connect();

    const server = new LobbyServer({
        'secretKey': 'zeesecret',
        'storage': new RedisStorage(redisClient),
    });
    server.start(9000);    
})();
