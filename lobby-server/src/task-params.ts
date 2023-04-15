export interface TaskParams {
    readonly scheduledTime: number;
    readonly type: string;
    readonly payload: AnyTaskPayload;
}

export interface AutoKickTaskPayload {
    readonly game: string;
    readonly lobbyId: string;
    readonly userId: string;
    readonly lastConnected: number;
};

export type AnyTaskPayload = AutoKickTaskPayload;
