import { InMemoryStorage, LobbyServer } from '@remvst/lobby-server';

const server = new LobbyServer({
    'secretKey': 'zeesecret',
    'storage': new InMemoryStorage(),
});
server.start(9000);