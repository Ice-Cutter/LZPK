import { Node, Prefab, instantiate } from 'cc';

/**
 * 通用对象池
 * 支持两种创建方式：Prefab 实例化 或 工厂函数
 */
export class ObjectPool {
    private _prefab: Prefab | null = null;
    private _createFn: (() => Node) | null = null;
    private _pool: Node[] = [];
    private _activeNodes: Node[] = [];

    /**
     * @param source Prefab 或 创建函数
     * @param preloadCount 预热数量
     */
    constructor(source: Prefab | (() => Node), preloadCount: number = 5) {
        if (typeof source === 'function') {
            this._createFn = source;
        } else {
            this._prefab = source;
        }
        for (let i = 0; i < preloadCount; i++) {
            const node = this._createNode();
            node.active = false;
            this._pool.push(node);
        }
    }

    private _createNode(): Node {
        if (this._createFn) {
            return this._createFn();
        }
        return instantiate(this._prefab!);
    }

    /** 从池中获取一个节点，可选设置父节点 */
    get(parent?: Node): Node {
        let node: Node;
        if (this._pool.length > 0) {
            node = this._pool.pop()!;
        } else {
            node = this._createNode();
        }
        if (parent) {
            node.parent = parent;
        }
        node.active = true;
        this._activeNodes.push(node);
        return node;
    }

    /** 回收节点到池中 */
    recycle(node: Node): void {
        node.active = false;
        const idx = this._activeNodes.indexOf(node);
        if (idx !== -1) {
            this._activeNodes.splice(idx, 1);
        }
        this._pool.push(node);
    }

    /** 回收所有活跃节点 */
    recycleAll(): void {
        for (const node of this._activeNodes) {
            node.active = false;
            this._pool.push(node);
        }
        this._activeNodes = [];
    }

    /** 获取当前活跃节点数量 */
    get activeCount(): number {
        return this._activeNodes.length;
    }

    /** 获取池中空闲节点数量 */
    get poolCount(): number {
        return this._pool.length;
    }

    /** 清空对象池 */
    clear(): void {
        for (const node of this._pool) node.destroy();
        for (const node of this._activeNodes) node.destroy();
        this._pool = [];
        this._activeNodes = [];
    }
}
