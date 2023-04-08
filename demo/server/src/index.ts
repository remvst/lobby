import { LobbyServer } from '@remvst/lobby-server';

const server = new LobbyServer({
    'secretKey': 'zeesecret',
});
server.start(9000);