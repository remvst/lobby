export interface Moderator {
    moderateLobbyDisplayName(lobbyDisplayName: string): string;
    moderatePlayerDisplayName(playerDisplayName: string): string;
}

export class DefaultModerator implements Moderator {
    moderateLobbyDisplayName(lobbyDisplayName: string): string {
        return lobbyDisplayName;
    }

    moderatePlayerDisplayName(playerDisplayName: string): string {
        return playerDisplayName;
    }
}
