import { _decorator, Component, Label, Node, sys } from 'cc';
import { EventBus, GameEvent } from '../core/EventBus';
import { PickupType } from '../pickup/PickupItem';
import { GameConfig } from '../core/GameConfig';

const { ccclass, property } = _decorator;

@ccclass('CoinCounter')
export class CoinCounter extends Component {
    // ========== 编辑器属性 ==========
    @property(Label)
    coinLabel: Label = null;

    @property(Node)
    coinIcon: Node = null;

    // ========== 运行时状态 ==========
    private _currentCoins: number = 0;
    private _totalCoins: number = 0;

    // ========== 属性访问器 ==========
    get currentCoins(): number { return this._currentCoins; }
    get totalCoins(): number { return this._totalCoins; }

    // ========== 生命周期 ==========
    onLoad(): void {
        this._loadTotalCoins();

        EventBus.on(GameEvent.PICKUP_COLLECTED, this._onPickupCollected, this);
        EventBus.on(GameEvent.GAME_START, this._onGameStart, this);
        EventBus.on(GameEvent.GAME_OVER, this._onGameOver, this);
        EventBus.on(GameEvent.GAME_RESTART, this._onGameRestart, this);

        this._updateLabel();
    }

    onDestroy(): void {
        EventBus.off(GameEvent.PICKUP_COLLECTED, this._onPickupCollected, this);
        EventBus.off(GameEvent.GAME_START, this._onGameStart, this);
        EventBus.off(GameEvent.GAME_OVER, this._onGameOver, this);
        EventBus.off(GameEvent.GAME_RESTART, this._onGameRestart, this);
    }

    // ========== 公有方法 ==========

    /** 手动添加金币（调试用） */
    addCoins(count: number): void {
        this._currentCoins += count;
        this._updateLabel();
    }

    // ========== 私有方法 ==========

    private _onPickupCollected(type: string, points: number): void {
        if (type === PickupType.COIN) {
            this._currentCoins++;
            this._updateLabel();
        }
    }

    private _onGameStart(): void {
        this._currentCoins = 0;
        this._updateLabel();
    }

    private _onGameOver(): void {
        this._totalCoins += this._currentCoins;
        this._saveTotalCoins();
    }

    private _onGameRestart(): void {
        this._currentCoins = 0;
        this._updateLabel();
    }

    private _updateLabel(): void {
        if (this.coinLabel) {
            this.coinLabel.string = `\u00D7 ${this._currentCoins}`;
        }
    }

    private _loadTotalCoins(): void {
        const val = sys.localStorage.getItem(GameConfig.STORAGE_TOTAL_COINS);
        this._totalCoins = val ? parseInt(val) : 0;
    }

    private _saveTotalCoins(): void {
        sys.localStorage.setItem(GameConfig.STORAGE_TOTAL_COINS, String(this._totalCoins));
    }
}
