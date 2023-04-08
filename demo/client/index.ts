import { LobbyClient } from '@remvst/lobby-client';

window.addEventListener('load', () => {
    console.log('loaded! connect?');

    const client = new LobbyClient({
        'lobbyId': 'zee lobby',
        'url': 'http://localhost:9000/',
        'userId': 'meeself'
    });
    client.onDisconnected = () => {
        console.log('diconnected');
    }
    client.onLobbyUpdated = (lobby) => {
        console.log('onlobbyupdated', lobby);
    };
    client.onGameUpdate = (update) => {
        console.log('ongameupdate', update);
    };
    client.connect()
        .then(() => {
            console.log('we are connected');
        })
        .catch((err) => {
            console.error(err);
        });
});