import { createClient } from "redis";
import { User } from "../../../shared/api";
import { LobbyDetails } from "../model/lobby-details";
import { ItemController, MapController, Storage } from "./storage";

type RedisClientType = ReturnType<typeof createClient>;

class RedisMapController<T> implements MapController<T> {
    constructor(
        private readonly client: RedisClientType,
        private readonly hashKey: string,
    ) {}

    async keys(): Promise<string[]> {
        return await this.client.hKeys(this.hashKey);
    }

    async entries(): Promise<Map<string, T>> {
        const results = await this.client.hGetAll(this.hashKey);
        return new Map(
            Object.entries(results).map(([key, value]) => [
                key,
                JSON.parse(value),
            ]),
        );
    }

    item(key: string): ItemController<T> {
        return new RedisMapItemController(this.client, this.hashKey, key);
    }

    async size(): Promise<number> {
        return await this.client.hLen(this.hashKey);
    }
}

class RedisMapItemController<T> implements ItemController<T> {
    constructor(
        private readonly client: RedisClientType,
        private readonly hashKey: string,
        private readonly itemKey: string,
    ) {}

    async get(): Promise<T | null> {
        const asJson = await this.client.hGet(this.hashKey, this.itemKey);
        if (!asJson) return null;
        return JSON.parse(asJson);
    }

    async set(value: T): Promise<void> {
        const asJson = JSON.stringify(value);
        await this.client.hSet(this.hashKey, this.itemKey, asJson);
    }

    async delete(): Promise<void> {
        await this.client.hDel(this.hashKey, this.itemKey);
    }
}

class RedisItemController<T> implements ItemController<T> {
    constructor(
        private readonly client: RedisClientType,
        private readonly itemKey: string,
    ) {}

    async get(): Promise<T | null> {
        const asJson = await this.client.get(this.itemKey);
        if (!asJson) return null;
        return JSON.parse(asJson);
    }

    async set(value: T): Promise<void> {
        const asJson = JSON.stringify(value);
        await this.client.set(this.itemKey, asJson);
    }

    async delete(): Promise<void> {
        await this.client.del(this.itemKey);
    }
}

export class RedisStorage implements Storage {
    constructor(readonly client: RedisClientType) {}

    lobbies(gameId: string): MapController<LobbyDetails> {
        return new RedisMapController(this.client, `lobbies-${gameId}`);
    }

    participants(lobbyId: string): MapController<User> {
        return new RedisMapController(this.client, `participants-${lobbyId}`);
    }

    participantMeta(
        lobbyId: string,
        participantId: string,
    ): MapController<string | number | boolean> {
        return new RedisMapController(
            this.client,
            `participant-meta-${lobbyId}-${participantId}`,
        );
    }

    latency(participantId: string): ItemController<number> {
        return new RedisItemController(
            this.client,
            `participant-latency-${participantId}`,
        );
    }
}
