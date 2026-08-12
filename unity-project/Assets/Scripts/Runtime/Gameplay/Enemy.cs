using UnityEngine;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 基础杂兵（E3.2 / E3.1）。
    /// 简单 AI：朝玩家移动 + 周期开火（敌弹入 BulletPool）。
    /// 1 类基础杂兵占位；多类型留待 P1。
    /// </summary>
    public class Enemy : Entity
    {
        [SerializeField] private float moveSpeed = 3f;
        [SerializeField] private float fireInterval = 1.5f;
        [SerializeField] private float bulletSpeed = 8f;
        [SerializeField] private float bulletDamage = 10f;
        [SerializeField] private float hitRadius = 0.4f;
        [SerializeField] private SpriteRenderer bodyRenderer;

        private Transform _target;
        private BulletPool _pool;
        private float _fireTimer;

        public float HitRadius => hitRadius;

        protected override void Awake()
        {
            base.Awake();
            faction = Faction.Enemy;
            maxHp = 30f;
            Hp = maxHp;
            EnsurePlaceholderVisual();
        }

        public void Init(Transform target, BulletPool pool)
        {
            _target = target;
            _pool = pool;
        }

        private void Update()
        {
            base.Update();
            if (!IsAlive || _target == null) return;

            // 朝玩家移动
            Vector2 dir = ((Vector2)_target.position - (Vector2)transform.position).normalized;
            transform.position += (Vector3)(dir * moveSpeed * Time.deltaTime);

            // 周期开火
            _fireTimer -= Time.deltaTime;
            if (_fireTimer <= 0f)
            {
                _fireTimer = fireInterval;
                if (_pool != null)
                    _pool.Spawn(transform.position, dir * bulletSpeed, bulletDamage, Faction.Enemy);
            }
        }

        protected override void OnDeath()
        {
            base.OnDeath();
            // 触发掉落/拾取（E2.2 / E4.1）→ 由 EnemySpawner 统一回收
            if (ServiceLocator.TryGet(out EnemySpawner spawner))
                spawner.OnEnemyKilled(this);
        }

        private void EnsurePlaceholderVisual()
        {
            if (bodyRenderer == null)
            {
                var go = new GameObject("EnemyBody");
                go.transform.SetParent(transform, false);
                bodyRenderer = go.AddComponent<SpriteRenderer>();
                bodyRenderer.color = new Color(1f, 0.4f, 0.4f);
                bodyRenderer.transform.localScale = new Vector3(0.6f, 0.6f, 1f);
            }
        }
    }
}
