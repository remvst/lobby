export interface LobbyDetails {
    id: string;
    game: string;
    displayName: string;
    leader: string;
    maxParticipants: number;
    created: number;
    lastUpdate: number;
    isPrivate: boolean;
}
