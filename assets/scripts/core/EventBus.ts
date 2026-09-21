interface Listener {
    callback: (...args: any[]) => void;
    target?: any;
}

export class EventBus {
    private static _listeners: Map<string, Listener[]> = new Map();

    static on(event: string, callback: (...args: any[]) => void, target?: any): void {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        const list = this._listeners.get(event)!;
        if (!list.some(l => l.callback === callback && l.target === target)) {
            list.push({ callback, target });
        }
    }

    static off(event: string, callback: (...args: any[]) => void, target?: any): void {
        const list = this._listeners.get(event);
        if (!list) return;
        const idx = list.findIndex(l => l.callback === callback && l.target === target);
        if (idx !== -1) list.splice(idx, 1);
    }

    static emit(event: string, ...args: any[]): void {
        const list = this._listeners.get(event);
        if (!list) return;
        for (const l of [...list]) {
            l.callback.apply(l.target, args);
        }
    }

    static clear(): void {
        this._listeners.clear();
    }
}

export enum GameEvent {
    INTRO_COMPLETE = 'intro_complete',
    GAME_START = 'game_start',
    GAME_OVER = 'game_over',
    GAME_RESTART = 'game_restart',
    SCORE_CHANGE = 'score_change',
    SPEED_CHANGE = 'speed_change',
    PLAYER_JUMP = 'player_jump',
    PLAYER_LAND = 'player_land',
    PLAYER_DIE = 'player_die',
    PLAYER_CROUCH = 'player_crouch',
    PLAYER_STAND = 'player_stand',
    OBSTACLE_SPAWNED = 'obstacle_spawned',
    OBSTACLE_PASSED = 'obstacle_passed',
    NEW_HIGH_SCORE = 'new_high_score',
    MILESTONE = 'milestone',
    PICKUP_COLLECTED = 'pickup_collected',
    SHIELD_ACTIVATED = 'shield_activated',
    SHIELD_BROKEN = 'shield_broken',
    POWERUP_START = 'powerup_start',
    POWERUP_END = 'powerup_end',

    // 移动端输入事件（由 MobileController 发出，PlayerController 监听）
    PLAYER_INPUT_JUMP = 'player_input_jump',
    PLAYER_INPUT_HIGH_JUMP = 'player_input_high_jump',
    PLAYER_INPUT_CROUCH = 'player_input_crouch',
    PLAYER_INPUT_STAND = 'player_input_stand',
}
