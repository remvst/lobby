import { User } from '../../../shared/api';
import { LobbyDetails } from '../model/lobby-details';

export interface MapController<T> {
    keys(): Promise<string[]>;
    entries(): Promise<Map<string, T>>;
    item(key: string): MapItemController<T>;
    size(): Promise<number>;
}

export interface MapItemController<T> {
    get(): Promise<T | null>;
    set(value: T): Promise<void>;
    delete(): Promise<void>;
}

export interface ListController<T> {
    add(value: T): Promise<void>;
    delete(key: T): Promise<void>;
    values(): Promise<T[]>;
}

export interface Storage {
    lobbies(gameId: string): MapController<LobbyDetails>;
    participants(lobbyId: string): MapController<User>;
}
