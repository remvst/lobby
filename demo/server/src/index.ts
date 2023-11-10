import { AnyMessage } from './../../../lobby-client/lib/shared/message.d';
import { LobbyHttpServer, LobbyService, RedisStorage, NotFoundError } from '@remvst/lobby-server';
import { RedisMemoryServer } from 'redis-memory-server';
import { createClient } from 'redis';
import express from 'express';
import http from 'http';
import cors from 'cors';
import ServerHostSocket from './server-host-socket';

async function setupServerSideLobby(service: LobbyService) {
    // Create a lobby
    const { lobby, token, user } = await service.create({
        game: 'lobby-demo',
        lobbyDisplayName: 'Server-side lobby',
        playerDisplayName: '!server',
    });

    let updatedLobby = lobby;

    // Create a fake socket that will always be connected to the service
    const serverSocket = new ServerHostSocket(token);
    serverSocket.sendFromServiceListener = (message: AnyMessage) => {
        if (message.type === 'lobby-updated') {
            updatedLobby = message.lobby;
        }
    };
    service.onNewConnection(serverSocket);

    // Game updates
    setInterval(async () => {
        for (const { id } of updatedLobby.participants) {
            // Don't send updates to ourselves
            if (id === user.id) continue;

            try {
                await service.sendDataMessage({
                    game: lobby.game,
                    lobbyId: lobby.id,
                    fromUserId: user.id,
                    toUserId: id,
                    data: { 
                        'foo': 'bar',
                    }
                });
            } catch (err) {
                if (err instanceof NotFoundError) {
                    console.error(`Player ${id} is disconnected`);
                } else {
                    throw err;
                }
            }
        }
    }, 2000);
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

    new LobbyHttpServer(service, server, app);

    setupServerSideLobby(service);

    console.log(`Starting lobby-server on port ${port}`);
    server.listen(9000, () => console.log(`Ready`));   
})();
