import {
    ConnectionState,
    HttpServerApi,
    LobbyClient,
} from "@remvst/lobby-client";

window.addEventListener("load", () => {
    // const api = new InMemoryApi();
    const api = new HttpServerApi("http://localhost:9000");

    const client: LobbyClient = new LobbyClient({
        game: "lobby-demo",
        api,
    });

    const dom = {
        playerDisplayName: document.querySelector(
            "#player-display-name",
        ) as HTMLInputElement,
        lobbyDisplayName: document.querySelector(
            "#lobby-display-name",
        ) as HTMLInputElement,
        lobbyId: document.querySelector("#lobby-id") as HTMLSelectElement,
        refresh: document.querySelector("#refresh") as HTMLInputElement,
        kickedUserId: document.querySelector("#kicked-user-id") as HTMLSelectElement,
        kick: document.querySelector("#kick") as HTMLButtonElement,
        create: document.querySelector("#create") as HTMLButtonElement,
        join: document.querySelector("#join") as HTMLButtonElement,
        disconnect: document.querySelector("#disconnect") as HTMLButtonElement,
        lobbyState: document.querySelector("#lobby-state") as HTMLPreElement,
        log: document.querySelector("#log") as HTMLDivElement,
        textMessage: document.querySelector(
            "#text-message",
        ) as HTMLInputElement,
        sendText: document.querySelector("#send-text") as HTMLButtonElement,
        dataMessage: document.querySelector(
            "#data-message",
        ) as HTMLButtonElement,
        dataRecipient: document.querySelector(
            "#data-recipient",
        ) as HTMLSelectElement,
        sendData: document.querySelector("#send-data") as HTMLButtonElement,
        increaseScore: document.querySelector(
            "#increase-score",
        ) as HTMLButtonElement,
        statusMessage: document.querySelector(
            "#status-message",
        ) as HTMLButtonElement,
        sendStatus: document.querySelector("#send-status") as HTMLButtonElement,
        ping: document.querySelector("#ping") as HTMLButtonElement,
    };

    dom.playerDisplayName.value =
        dom.playerDisplayName.value || `user-${~~(Math.random() * 100)}`;
    dom.lobbyDisplayName.value =
        dom.lobbyDisplayName.value || `lobby-${~~(Math.random() * 100)}`;
    updateForConnectionState(ConnectionState.DISCONNECTED);

    client.onConnectionStateChanged = (state) => {
        log(`onConnectionStateChanged: ${state}`);
        updateForConnectionState(state);
    };
    client.onLobbyUpdated = (lobby) => {
        log(`onLobbyUpdated: ${JSON.stringify(lobby)}`);
        dom.lobbyState.innerHTML = JSON.stringify(lobby, null, 4);

        dom.dataRecipient.innerHTML = "";
        for (const participant of lobby.participants) {
            const element = document.createElement("option");
            element.value = participant.id;
            element.innerText = `${participant.metadata.displayName} (${participant.id})`;
            dom.dataRecipient.appendChild(element);
        }

        dom.kickedUserId.innerHTML = "";
        for (const participant of lobby.participants) {
            const element = document.createElement("option");
            element.value = participant.id;
            element.innerText = `${participant.metadata.displayName} (${participant.id})`;
            dom.kickedUserId.appendChild(element);
        }
    };
    client.onDataMessage = async (userId: string, message: any) => {
        log(`onDataMessage (${userId}): ${JSON.stringify(message)}`);
    };
    client.onTextMessage = (userId: string, message: string) => {
        log(`onTextMessage (${userId}): ${message}`);
    };
    client.onStatusMessage = (message: string) => {
        log(`onStatusMessage: ${message}`);
    };

    function log(message: string) {
        console.log(message);

        const logElement = document.createElement("div");
        logElement.innerText = message;
        dom.log.appendChild(logElement);
    }

    function updateForConnectionState(state: ConnectionState) {
        switch (state) {
            case ConnectionState.CONNECTED:
                dom.create.disabled = dom.join.disabled = true;
                dom.disconnect.disabled = false;
                dom.playerDisplayName.disabled =
                    dom.lobbyId.disabled =
                    dom.lobbyDisplayName.disabled =
                        true;
                dom.sendText.disabled =
                    dom.textMessage.disabled =
                    dom.sendStatus.disabled =
                        false;
                dom.increaseScore.disabled = false;
                break;
            case ConnectionState.CONNECTING:
                dom.create.disabled = dom.join.disabled = true;
                dom.disconnect.disabled = false;
                dom.playerDisplayName.disabled =
                    dom.lobbyId.disabled =
                    dom.lobbyDisplayName.disabled =
                        true;
                dom.sendText.disabled =
                    dom.textMessage.disabled =
                    dom.sendStatus.disabled =
                        true;
                dom.increaseScore.disabled = true;
                break;
            case ConnectionState.DISCONNECTED:
                dom.create.disabled = dom.join.disabled = false;
                dom.disconnect.disabled = true;
                dom.playerDisplayName.disabled =
                    dom.lobbyId.disabled =
                    dom.lobbyDisplayName.disabled =
                        false;
                dom.sendText.disabled =
                    dom.textMessage.disabled =
                    dom.sendStatus.disabled =
                        true;
                dom.increaseScore.disabled = false;
                break;
        }
    }

    dom.create.addEventListener(
        "click",
        () => {
            log(`Creating...`);

            client
                .createAndJoin({
                    lobbyDisplayName: dom.lobbyDisplayName.value,
                    playerDisplayName: dom.playerDisplayName.value,
                })
                .then(() => log(`Connected`))
                .catch((err) => log(err));
        },
        false,
    );

    dom.join.addEventListener(
        "click",
        () => {
            log(`Joining...`);

            const lobbyId = dom.lobbyId.value;

            client
                .join({
                    lobbyId,
                    playerDisplayName: dom.playerDisplayName.value,
                })
                .then(() => log(`Connected`))
                .catch((err) => log(err));
        },
        false,
    );

    dom.kick.addEventListener(
        "click",
        () => {
            log(`Kicking...`);

            const kickedUserId = dom.kickedUserId.value;

            client
                .kick(kickedUserId)
                .then(() => log(`Kicked`))
                .catch((err) => log(err));
        },
        false,
    );

    dom.refresh.addEventListener("click", async () => {
        log("Refreshing lobbies");
        const lobbies = await client.listLobbies();
        log(`Lobbies: ${JSON.stringify(lobbies)}`);

        dom.lobbyId.innerHTML = "";
        for (const lobby of lobbies) {
            const element = document.createElement("option");
            element.value = lobby.id;
            element.innerText = `${lobby.displayName} (${lobby.id})`;
            dom.lobbyId.appendChild(element);
        }
    });

    dom.disconnect.addEventListener(
        "click",
        () => {
            log(`Disconnecting...`);

            client
                ?.disconnect()
                .then(() => log(`Disconnected`))
                .catch((err) => log(err));
        },
        false,
    );

    dom.sendText.addEventListener(
        "click",
        () => {
            log(`Sending text message`);
            client?.sendTextMessage(dom.textMessage.value);
        },
        false,
    );

    dom.sendData.addEventListener(
        "click",
        () => {
            log(`Sending data message`);
            client?.sendDataMessage(
                dom.dataRecipient.value,
                dom.dataMessage.value,
            );
        },
        false,
    );

    dom.sendStatus.addEventListener(
        "click",
        () => {
            log(`Sending status message`);
            client?.sendStatusMessage(dom.statusMessage.value);
        },
        false,
    );

    dom.increaseScore.addEventListener(
        "click",
        () => {
            log(`Increasing my score ` + client.userId);

            const myUser = client.lobby.participants.filter(
                (p) => p.id === client.userId,
            )[0];
            const newScore = (myUser.metadata.score || 0) + 1;

            client.setMetadata(client.userId, "score", newScore);
        },
        false,
    );

    dom.ping.addEventListener(
        "click",
        async () => {
            log(`Sending a ping`);

            const before = performance.now();
            await client.ping();
            const after = performance.now();

            log(`Ping time: ${after - before}ms`);
        },
        false,
    );
});
