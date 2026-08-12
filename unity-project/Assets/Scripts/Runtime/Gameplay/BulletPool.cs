using UnityEngine;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 弹幕对象池（ADR-002 Simulation 层 / E3.1）。
    /// SoA 数组池：position/velocity/active 分离存储，合批友好。
    /// 容量 3000（设计峰值 main-architecture §3），预留 ISimulationBackend 接口换 Job/Burst（R1 缓解）。
    /// </summary>
    public interface ISimulationBackend
    {
        int Capacity { get; }
        int ActiveCount { get; }
        int Spawn(Vector2 pos, Vector2 vel, float damage, Entity.Faction faction);
        void Despawn(int index);
        void Step(float dt);
        Vector2 GetPosition(int index);
    }

    /// <summary>
    /// MainThread 数组池后端（垂直切片起步方案，ADR-002）。
    /// 由 BulletRenderer 单 MonoBehaviour 用 Graphics.DrawMeshInstanced 合批渲染。
    /// </summary>
    public sealed class BulletPool : ISimulationBackend
    {
        private readonly Vector2[] _pos;
        private readonly Vector2[] _vel;
        private readonly float[] _dmg;
        private readonly Entity.Faction[] _faction;
        private readonly bool[] _active;
        private readonly int[] _lifetime; // 帧数
        private int _activeCount;
        private readonly int _capacity;
        private readonly float _bulletRadius;

        // 空闲索引栈（O(1) 分配/回收）
        private readonly int[] _freeStack;
        private int _freeTop;

        public int Capacity => _capacity;
        public int ActiveCount => _activeCount;

        public BulletPool(int capacity = 3000, float bulletRadius = 0.12f)
        {
            _capacity = capacity;
            _bulletRadius = bulletRadius;
            _pos = new Vector2[capacity];
            _vel = new Vector2[capacity];
            _dmg = new float[capacity];
            _faction = new Entity.Faction[capacity];
            _active = new bool[capacity];
            _lifetime = new int[capacity];
            _freeStack = new int[capacity];
            _freeTop = capacity;
            for (int i = 0; i < capacity; i++) _freeStack[i] = capacity - 1 - i;
        }

        public int Spawn(Vector2 pos, Vector2 vel, float damage, Entity.Faction faction)
        {
            if (_freeTop <= 0) return -1; // 池满（B6 不溢出）
            int idx = _freeStack[--_freeTop];
            _pos[idx] = pos;
            _vel[idx] = vel;
            _dmg[idx] = damage;
            _faction[idx] = faction;
            _active[idx] = true;
            _lifetime[idx] = 600; // ~10s @60fps
            _activeCount++;
            return idx;
        }

        public void Despawn(int index)
        {
            if (index < 0 || index >= _capacity || !_active[index]) return;
            _active[index] = false;
            _freeStack[_freeTop++] = index;
            _activeCount--;
        }

        public void Step(float dt)
        {
            // 简单 AABB 边界（场景边界 ±50）；超出回收
            const float Bound = 60f;
            for (int i = 0; i < _capacity; i++)
            {
                if (!_active[i]) continue;
                _pos[i] += _vel[i] * dt;
                if (--_lifetime[i] <= 0 ||
                    _pos[i].x < -Bound || _pos[i].x > Bound ||
                    _pos[i].y < -Bound || _pos[i].y > Bound)
                {
                    Despawn(i);
                }
            }
        }

        public Vector2 GetPosition(int index)
        {
            return _pos[index];
        }

        // —— 渲染读取（供 BulletRenderer 拷贝到 Matrix4x4[]）——
        public void CopyActivePositions(Matrix4x4[] outMatrices, float scale, out int count)
        {
            int c = 0;
            int cap = outMatrices.Length;
            for (int i = 0; i < _capacity && c < cap; i++)
            {
                if (!_active[i]) continue;
                outMatrices[c++] = Matrix4x4.TRS(
                    new Vector3(_pos[i].x, _pos[i].y, 0f),
                    Quaternion.identity,
                    new Vector3(scale, scale, 1f));
            }
            count = c;
        }

        public Entity.Faction GetFaction(int index) => _faction[index];
        public float GetDamage(int index) => _dmg[index];
        public float BulletRadius => _bulletRadius;
        public bool IsActiveIndex(int index) => index >= 0 && index < _capacity && _active[index];

        /// <summary>碰撞查询：返回命中玩家的第一个敌方子弹索引（-1=未命中）。</summary>
        public int QueryHitPlayer(Vector2 playerPos, float playerRadius)
        {
            float r = playerRadius + _bulletRadius;
            float rSq = r * r;
            for (int i = 0; i < _capacity; i++)
            {
                if (!_active[i]) continue;
                if (_faction[i] != Entity.Faction.Enemy) continue;
                Vector2 d = _pos[i] - playerPos;
                if (d.x * d.x + d.y * d.y <= rSq) return i;
            }
            return -1;
        }

        /// <summary>碰撞查询：返回命中指定敌人位置的玩家子弹索引。</summary>
        public int QueryHitEnemy(Vector2 enemyPos, float enemyRadius)
        {
            float r = enemyRadius + _bulletRadius;
            float rSq = r * r;
            for (int i = 0; i < _capacity; i++)
            {
                if (!_active[i]) continue;
                if (_faction[i] != Entity.Faction.Player) continue;
                Vector2 d = _pos[i] - enemyPos;
                if (d.x * d.x + d.y * d.y <= rSq) return i;
            }
            return -1;
        }

        public void DespawnAll()
        {
            for (int i = 0; i < _capacity; i++) _active[i] = false;
            _freeTop = _capacity;
            for (int i = 0; i < _capacity; i++) _freeStack[i] = _capacity - 1 - i;
            _activeCount = 0;
        }
    }
}
