import { User } from "./api";

export interface Lobby {
    id: string;
    displayName: string;
    leader?: string;
    participants: User[];
}
