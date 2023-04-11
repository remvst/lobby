import { User } from "./api";

export interface Lobby {
    id: string;
    displayName: string;
    leader: string;
    maxParticipants: number;
    participants: User[];
    created: number;
    lastUpdate: number;
}
