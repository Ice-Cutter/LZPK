import { _decorator, Component, input, Input, KeyCode, UITransform, BoxCollider2D, Contact2DType, Collider2D } from 'cc';
import { GameConfig } from '../core/GameConfig';
import { EventBus, GameEvent } from '../core/EventBus';
import { GameManager, GameState } from '../core/GameManager';

const { ccclass, property } = _decorator;

export enum PlayerState {
    IDLE,
    RUNNING,
    JUMPING,
    CROUCHING,
    DEAD,
}

@ccclass('PlayerController')
export class PlayerController extends Component {
    // ========== 编辑器属性 ==========
    @property
    jumpForce: number = GameConfig.PLAYER_JUMP_FORCE;

    @property
    highJumpForce: number = GameConfig.PLAYER_HIGH_JUMP_FORCE;

    @property
    gravity: number = GameConfig.PLAYER_GRAVITY;

    @property({ tooltip: '玩家着地时节点的中心 Y。留 0 则运行时自动根据 UITransform 高度计算' })
    groundY: number = 0;

    @property
    crouchScaleY: number = 0.5;

    @property({ tooltip: '玩家整体缩放倍率（视觉+碰撞同步放大/缩小，1.0=默认）' })
    playerScale: number = 1.0;

    // 静态实例
    private static _instance: PlayerController = null;
    static get instance(): PlayerController { return PlayerController._instance; }

    // ========== 运行时状态 ==========
    private _state: PlayerState = PlayerState.IDLE;
    private _velocityY: number = 0;
    private _isGrounded: boolean = true;
    private _isCrouching: boolean = false;
    private _isJumpKeyHeld: boolean = false;
    private _jumpPressed: boolean = false;
    private _crouchPressed: boolean = false;

    // 基础尺寸（编辑器设定值，scale=1.0 时）
    private _baseVisualW: number = 0;
    private _baseVisualH: number = 0;
    private _baseColliderW: number = 0;
    private _baseColliderH: number = 0;

    // 组件缓存
    private _uiTransform: UITransform = null;
    private _collider: BoxCollider2D = null;

    // 无敌帧
    private _invincible: boolean = false;
    private _invincibleTimer: number = 0;
    private static readonly INVINCIBLE_DURATION: number = 1.0;

    // ========== 属性访问器 ==========
    get playerState(): PlayerState { return this._state; }
    get isGrounded(): boolean { return this._isGrounded; }
    get velocityY(): number { return this._velocityY; }

    // ========== 生命周期 ==========
    onLoad(): void {
        PlayerController._instance = this;

        this._uiTransform = this.node.getComponent(UITransform);
        this._collider = this.node.getComponent(BoxCollider2D);

        // 记录编辑器中的原始尺寸（scale=1.0 基准值）
        if (this._uiTransform) {
            this._baseVisualW = this._uiTransform.width;
            this._baseVisualH = this._uiTransform.height;
            this._syncGroundY();
        }
        if (this._collider) {
            this._baseColliderW = this._collider.size.width;
            this._baseColliderH = this._collider.size.height;
            this._collider.on(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);
        }

        this._registerInput();
        this._registerMobileInput();
        EventBus.on(GameEvent.GAME_RESTART, this._onGameRestart, this);
    }

    start(): void {
        // 应用 playerScale 到视觉和碰撞体
        this._applyScale();
        // 重置到正确位置，防止编辑器拖拽残留
        this.node.setPosition(GameConfig.PLAYER_X, this.groundY, 0);
    }

    update(deltaTime: number): void {
        // 无敌帧倒计时（在 DEAD 检查之前，确保计时器始终运行）
        if (this._invincible) {
            this._invincibleTimer -= deltaTime;
            if (this._invincibleTimer <= 0) {
                this._invincible = false;
            }
        }

        if (this._state === PlayerState.DEAD) return;

        const gameState = GameManager.instance?.state;
        if (gameState !== GameState.PLAYING) return;

        // 处理输入
        this._processInput();

        // 更新跳跃物理
        this._updateJumpPhysics(deltaTime);

        // 更新跑步状态
        if (this._state === PlayerState.IDLE) {
            this._setState(PlayerState.RUNNING);
        }
    }

    onDestroy(): void {
        if (PlayerController._instance === this) PlayerController._instance = null;
        this._unregisterInput();
        this._unregisterMobileInput();
        EventBus.off(GameEvent.GAME_RESTART, this._onGameRestart, this);
        if (this._collider) {
            this._collider.off(Contact2DType.BEGIN_CONTACT, this._onBeginContact, this);
        }
    }

    // ========== 公有方法 ==========

    jump(highJump: boolean = false): void {
        if (!this._isGrounded || this._state === PlayerState.CROUCHING || this._state === PlayerState.DEAD) return;

        this._velocityY = highJump ? this.highJumpForce : this.jumpForce;
        this._isGrounded = false;
        this._isJumpKeyHeld = highJump;
        this._setState(PlayerState.JUMPING);
        EventBus.emit(GameEvent.PLAYER_JUMP);
    }

    crouch(): void {
        if (!this._isGrounded || this._state === PlayerState.DEAD) return;
        if (this._isCrouching) return;

        this._isCrouching = true;

        // 下蹲时保持脚底在地面：缩放前先下移，补偿中心点偏移
        const standingHalfH = this._baseVisualH * this.playerScale / 2;
        const crouchHalfH = standingHalfH * this.crouchScaleY;
        const pos = this.node.position;
        this.node.setPosition(pos.x, pos.y - (standingHalfH - crouchHalfH), pos.z);

        // 视觉下蹲：缩放节点 Y 轴
        this.node.setScale(this.node.scale.x, this.crouchScaleY, 1);

        // 碰撞体同步缩小
        if (this._collider) {
            this._collider.size.width = this._baseColliderW * this.playerScale;
            this._collider.size.height = this._baseColliderH * this.playerScale * this.crouchScaleY;
        }

        this._setState(PlayerState.CROUCHING);
        EventBus.emit(GameEvent.PLAYER_CROUCH);
    }

    standUp(): void {
        if (!this._isCrouching) return;

        // 先恢复位置（补偿下蹲时下移的偏移）
        const standingHalfH = this._baseVisualH * this.playerScale / 2;
        const crouchHalfH = standingHalfH * this.crouchScaleY;
        const pos = this.node.position;
        this.node.setPosition(pos.x, pos.y + (standingHalfH - crouchHalfH), pos.z);

        this._isCrouching = false;

        // 恢复视觉比例
        this.node.setScale(this.node.scale.x, 1, 1);

        // 恢复碰撞体大小
        if (this._collider) {
            this._collider.size.width = this._baseColliderW * this.playerScale;
            this._collider.size.height = this._baseColliderH * this.playerScale;
        }

        this._setState(this._isGrounded ? PlayerState.RUNNING : PlayerState.JUMPING);
        EventBus.emit(GameEvent.PLAYER_STAND);
    }

    die(): void {
        if (this._state === PlayerState.DEAD) return;

        // 无敌帧保护
        if (this._invincible) return;

        // 护盾抵挡一次致命碰撞
        const gm = GameManager.instance;
        if (gm && gm.shieldActive) {
            this._invincible = true;
            this._invincibleTimer = PlayerController.INVINCIBLE_DURATION;
            EventBus.emit(GameEvent.PLAYER_DIE);
            return;
        }

        this._setState(PlayerState.DEAD);
        this._velocityY = 0;
        EventBus.emit(GameEvent.PLAYER_DIE);
    }

    // ========== 私有方法 ==========

    /** 将 playerScale 应用到 UITransform 和 BoxCollider2D */
    private _applyScale(): void {
        const s = this.playerScale;
        if (this._uiTransform) {
            this._uiTransform.setContentSize(this._baseVisualW * s, this._baseVisualH * s);
        }
        if (this._collider) {
            this._collider.size.width = this._baseColliderW * s;
            this._collider.size.height = this._baseColliderH * s;
        }
        // 缩放后重新对齐脚底到地面
        this._syncGroundY();
    }

    /** 根据当前 UITransform 实际高度，将 groundY 同步为 GROUND_Y + 半高 */
    private _syncGroundY(): void {
        if (this._uiTransform) {
            this.groundY = GameConfig.GROUND_Y + this._uiTransform.height / 2;
        }
    }

    private _registerInput(): void {
        input.on(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this._onKeyUp, this);
    }

    private _unregisterInput(): void {
        input.off(Input.EventType.KEY_DOWN, this._onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this._onKeyUp, this);
    }

    private _registerMobileInput(): void {
        EventBus.on(GameEvent.PLAYER_INPUT_JUMP, this._onMobileJump, this);
        EventBus.on(GameEvent.PLAYER_INPUT_HIGH_JUMP, this._onMobileHighJump, this);
        EventBus.on(GameEvent.PLAYER_INPUT_CROUCH, this._onMobileCrouch, this);
        EventBus.on(GameEvent.PLAYER_INPUT_STAND, this._onMobileStand, this);
    }

    private _unregisterMobileInput(): void {
        EventBus.off(GameEvent.PLAYER_INPUT_JUMP, this._onMobileJump, this);
        EventBus.off(GameEvent.PLAYER_INPUT_HIGH_JUMP, this._onMobileHighJump, this);
        EventBus.off(GameEvent.PLAYER_INPUT_CROUCH, this._onMobileCrouch, this);
        EventBus.off(GameEvent.PLAYER_INPUT_STAND, this._onMobileStand, this);
    }

    private _onMobileJump(): void {
        if (GameManager.instance?.state !== GameState.PLAYING) return;
        this._jumpPressed = true;
        this._isJumpKeyHeld = false;
    }

    private _onMobileHighJump(): void {
        if (GameManager.instance?.state !== GameState.PLAYING) return;
        this._jumpPressed = true;
        this._isJumpKeyHeld = true;
    }

    private _onMobileCrouch(): void {
        if (GameManager.instance?.state !== GameState.PLAYING) return;
        this._crouchPressed = true;
    }

    private _onMobileStand(): void {
        if (GameManager.instance?.state !== GameState.PLAYING) return;
        this._crouchPressed = false;
    }

    private _processInput(): void {
        if (this._jumpPressed) {
            this._jumpPressed = false;
            this.jump(this._isJumpKeyHeld);
        }
        if (this._crouchPressed && !this._isCrouching) {
            this.crouch();
        } else if (!this._crouchPressed && this._isCrouching) {
            this.standUp();
        }
    }

    private _onKeyDown(event: any): void {
        const keyCode = event.keyCode;
        if (keyCode === KeyCode.SPACE || keyCode === KeyCode.ARROW_UP || keyCode === KeyCode.KEY_W) {
            this._jumpPressed = true;
            this._isJumpKeyHeld = true;
        }
        if (keyCode === KeyCode.ARROW_DOWN || keyCode === KeyCode.KEY_S) {
            this._crouchPressed = true;
        }
    }

    private _onKeyUp(event: any): void {
        const keyCode = event.keyCode;
        if (keyCode === KeyCode.SPACE || keyCode === KeyCode.ARROW_UP || keyCode === KeyCode.KEY_W) {
            this._isJumpKeyHeld = false;
        }
        if (keyCode === KeyCode.ARROW_DOWN || keyCode === KeyCode.KEY_S) {
            this._crouchPressed = false;
        }
    }

    private _updateJumpPhysics(deltaTime: number): void {
        if (this._isGrounded) return;

        // 手动重力模拟
        this._velocityY += this.gravity * deltaTime;

        const pos = this.node.position;
        const newY = pos.y + this._velocityY * deltaTime;

        if (newY <= this.groundY) {
            // 着地
            this.node.setPosition(pos.x, this.groundY, pos.z);
            this._velocityY = 0;
            this._isGrounded = true;
            this._isJumpKeyHeld = false;

            if (this._state !== PlayerState.CROUCHING && this._state !== PlayerState.DEAD) {
                this._setState(PlayerState.RUNNING);
            }
            EventBus.emit(GameEvent.PLAYER_LAND);
        } else {
            this.node.setPosition(pos.x, newY, pos.z);
        }
    }

    private _onBeginContact(selfCollider: Collider2D, otherCollider: Collider2D, contact: any): void {
        // 与地面碰撞 → 着地
        if (otherCollider.group === 2) {
            if (!this._isGrounded && this._velocityY < 0) {
                this._isGrounded = true;
                this._velocityY = 0;
                const pos = this.node.position;
                this.node.setPosition(pos.x, this.groundY, pos.z);

                if (this._state !== PlayerState.CROUCHING && this._state !== PlayerState.DEAD) {
                    this._setState(PlayerState.RUNNING);
                }
                EventBus.emit(GameEvent.PLAYER_LAND);
            }
        }

        // 与障碍物碰撞 → 死亡
        if (otherCollider.group === 4) {
            this.die();
        }
    }

    private _setState(newState: PlayerState): void {
        if (this._state === newState) return;
        this._state = newState;
    }

    private _onGameRestart(): void {
        // 恢复下蹲状态
        if (this._isCrouching) {
            this.node.setScale(this.node.scale.x, 1, 1);
            this._isCrouching = false;
        }

        // 重置无敌帧
        this._invincible = false;
        this._invincibleTimer = 0;
        this.node.active = true;

        // 重置物理状态
        this._velocityY = 0;
        this._isGrounded = true;
        this._isJumpKeyHeld = false;
        this._jumpPressed = false;
        this._crouchPressed = false;

        // 重新应用缩放（确保碰撞体正确）
        this._applyScale();

        // 重置位置
        this.node.setPosition(GameConfig.PLAYER_X, this.groundY, 0);

        // 重置状态
        this._setState(PlayerState.IDLE);
    }
}
