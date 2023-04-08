import { ConnectionState } from '@remvst/lobby-client';
import { LobbyClient } from '@remvst/lobby-client';

const params = new URLSearchParams(location.search);

window.addEventListener('load', () => {
    const client: LobbyClient = new LobbyClient({
        'url': 'http://localhost:9000',
    });
    let peerConnection: RTCPeerConnection;
    let dataChannel: RTCDataChannel;

    client.listLobbies().then((lobbies) => log(`Lobbies: ${JSON.stringify(lobbies)}`));

    const dom = {
        userId: document.querySelector('#user-id') as HTMLInputElement,
        lobbyId: document.querySelector('#lobby-id') as HTMLInputElement,
        connect: document.querySelector('#connect') as HTMLButtonElement,
        disconnect: document.querySelector('#disconnect') as HTMLButtonElement,
        lobbyState: document.querySelector('#lobby-state') as HTMLPreElement,
        log: document.querySelector('#log') as HTMLDivElement,
        textMessage: document.querySelector('#text-message') as HTMLInputElement,
        sendText: document.querySelector('#send-text') as HTMLButtonElement,
        dataMessage: document.querySelector('#data-message') as HTMLButtonElement,
        dataRecipient: document.querySelector('#data-recipient') as HTMLSelectElement,
        sendData: document.querySelector('#send-data') as HTMLButtonElement,
        webrtcRecipient: document.querySelector('#webrtc-recipient') as HTMLSelectElement,
        initiateWebRTC: document.querySelector('#initiate-webrtc') as HTMLButtonElement,
    };

    dom.userId.value = dom.userId.value || params.get('userId') || `user-${~~(Math.random() * 100)}`;
    dom.lobbyId.value = dom.lobbyId.value || params.get('lobbyId') || `lobby-${~~(Math.random() * 100)}`;
    updateForConnectionState(ConnectionState.DISCONNECTED);

    client.onConnectionStateChanged = (state) => {
        log(`onConnectionStateChanged: ${state}`);
        updateForConnectionState(state);
    };
    client.onLobbyUpdated = (lobby) => {
        log(`onLobbyUpdated: ${JSON.stringify(lobby)}`);
        dom.lobbyState.innerHTML = JSON.stringify(lobby, null, 4);

        dom.dataRecipient.innerHTML = '';
        for (const participant of lobby.participants) {
            const element = document.createElement('option');
            element.value = participant;
            element.innerText = participant;
            dom.dataRecipient.appendChild(element);
        }

        dom.webrtcRecipient.innerHTML = '';
        for (const participant of lobby.participants) {
            const element = document.createElement('option');
            element.value = participant;
            element.innerText = participant;
            dom.webrtcRecipient.appendChild(element);
        }
    };
    client.onDataMessage = async (userId: string, message: any) => {
        log(`onDataMessage (${userId}): ${JSON.stringify(message)}`);

        if (message.type === 'offer') {
            peerConnection = createConnection(userId);

            await peerConnection.setRemoteDescription(message.offer);

            const answer = await peerConnection.createAnswer({});
            await peerConnection.setLocalDescription(answer);

            client?.sendDataMessage(userId, {'type': 'answer', answer});
        }

        if (message.type === 'answer') {
            await peerConnection.setRemoteDescription(message.answer);
        }

        if (message.type === 'candidate') {
            await peerConnection.addIceCandidate(message.candidate);
        }
    };
    client.onTextMessage = (userId: string, message: string) => {
        log(`onTextMessage (${userId}): ${message}`);
    };

    function log(msg: string) {
        console.log(msg);

        const logElement = document.createElement('div');
        logElement.innerText = msg;
        dom.log.appendChild(logElement);
    }

    function updateForConnectionState(state: ConnectionState) {
        switch (state) {
        case ConnectionState.CONNECTED:
            dom.connect.disabled = true;
            dom.disconnect.disabled = false;
            dom.userId.disabled = dom.lobbyId.disabled = true;
            dom.sendText.disabled = dom.textMessage.disabled = false;
            dom.webrtcRecipient.disabled = dom.initiateWebRTC.disabled = false;
            break;
        case ConnectionState.CONNECTING: 
            dom.connect.disabled = true;
            dom.disconnect.disabled = false;
            dom.userId.disabled = dom.lobbyId.disabled = true;
            dom.sendText.disabled = dom.textMessage.disabled = true;
            dom.webrtcRecipient.disabled = dom.initiateWebRTC.disabled = true;
            break;
        case ConnectionState.DISCONNECTED:
            dom.connect.disabled = false;
            dom.disconnect.disabled = true;
            dom.userId.disabled = dom.lobbyId.disabled = false;
            dom.sendText.disabled = dom.textMessage.disabled = true;
            dom.webrtcRecipient.disabled = dom.initiateWebRTC.disabled = true;
            break;
        }
    }

    function createConnection(withUserId: string) {
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                {urls: ['stun:stun.services.mozilla.com:3478']},
            ],
        });
        peerConnection.addEventListener('icecandidate', (event) => {
            const { candidate } = event;
            client?.sendDataMessage(withUserId, {'type': 'candidate', candidate});
        }, false);
        peerConnection.addEventListener('iceconnectionstatechange', () => {
            log(`iceconnectionstatechange: ${peerConnection.iceConnectionState}`);
        }, false);
        peerConnection.addEventListener('datachannel', (event) => {
            log(`datachannel ${event.channel.label}`);
            dataChannel = event.channel;
            initializeDataChannel(dataChannel);
        }, false);
        return peerConnection;
    }

    function initializeDataChannel(channel: RTCDataChannel) {
        channel.addEventListener('open', () => {
            log(`datachannel open ${channel.label}`);
            channel.send('somedata haha');
        });
        channel.addEventListener('message', (event) => {
            log(`datachannel data received ${event.data}`);
        });
    }

    dom.connect.addEventListener('click', () => {
        log(`Connecting...`);

        client.connect({
            'lobbyId': dom.lobbyId.value,
            'userId': dom.userId.value,
        })
            .then(() => {
                log(`Connected`);
            })
            .catch((err) => log(err));
    }, false);

    dom.disconnect.addEventListener('click', () => {
        log(`Disconnecting...`);

        client?.disconnect()
            .then(() => log(`Disconnected`))
            .catch((err) => log(err));
    }, false);

    dom.sendText.addEventListener('click', () => {
        log(`Sending text message`);
        client?.sendTextMessage(dom.textMessage.value);
    }, false);

    dom.sendData.addEventListener('click', () => {
        log(`Sending data message`);
        client?.sendDataMessage(dom.dataRecipient.value, dom.dataMessage.value);
    }, false);

    dom.initiateWebRTC.addEventListener('click', async () => {
        log(`Initiating WebRTC connection`);

        const recipient = dom.webrtcRecipient.value;

        peerConnection = createConnection(recipient);

        dataChannel = peerConnection.createDataChannel('data', {});
        initializeDataChannel(dataChannel);
        
        const offer = await peerConnection.createOffer({
            'offerToReceiveAudio': false,
            'offerToReceiveVideo': false,
        });
        peerConnection.setLocalDescription(offer);
        
        client?.sendDataMessage(recipient, {'type': 'offer', offer});
    }, false);
});