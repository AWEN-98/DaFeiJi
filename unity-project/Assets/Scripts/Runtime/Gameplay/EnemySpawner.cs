using System.Collections.Generic;
using UnityEngine;
using AirspaceEvacuation.Core;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 敌人生成器（E3.2 / E2.1）。
    /// 占位：按间隔从场景边缘生成基础杂兵，跟踪玩家。
    /// P0 不接 PCG 节点图（E2）；仅保证战斗环可跑。
    /// </summary>
    public class EnemySpawner : MonoBehaviour
    {
        [SerializeField] private Enemy enemyPrefab;
        [SerializeField] private PlayerAircraft player;
        [SerializeField] private float spawnInterval = 2.5f;
        [SerializeField] private int maxConcurrent = 12;
        [SerializeField] private float spawnRadius = 18f;

        private readonly List<Enemy> _alive = new List<Enemy>();
        private BulletPool _pool;
        private float _timer;
        private int _totalKills;

        public int ActiveCount => _alive.Count;

        private void Start()
        {
            if (ServiceLocator.TryGet(out BulletPool pool)) _pool = pool;
        }

        private void Update()
        {
            if (player == null || !player.IsAlive) return;
            _timer -= Time.deltaTime;
            if (_timer <= 0f && _alive.Count < maxConcurrent)
            {
                _timer = spawnInterval;
                SpawnOne();
            }
        }

        private void SpawnOne()
        {
            if (enemyPrefab == null) return;
            Vector2 dir = Random.insideUnitCircle.normalized;
            Vector3 pos = player.transform.position + (Vector3)(dir * spawnRadius);
            Enemy e = Instantiate(enemyPrefab, pos, Quaternion.identity);
            e.Init(player.transform, _pool);
            _alive.Add(e);
        }

        /// <summary>Enemy.OnDeath 回调：回收 + 掉落/事件。</summary>
        public void OnEnemyKilled(Enemy e)
        {
            _alive.Remove(e);
            _totalKills++;

            // 触发拾取事件（framework-scaffold OnPickup，E2.2）
            EventBus.Publish(new GameEvents.OnPickup
            {
                ItemId = "loot_scrap",
                LootSlot = _totalKills % 8,
                Rarity = 0,
            });

            // 累计局内击杀（run.save）
            if (ServiceLocator.TryGet(out Meta.RunState run))
            {
                run.RuntimeKills++;
            }

            Destroy(e.gameObject, 0.5f);
        }

        /// <summary>由 SimulationDriver 调用：解析玩家子弹命中敌人（B1/B4）。</summary>
        public void ResolveBulletHits(BulletPool pool)
        {
            for (int i = _alive.Count - 1; i >= 0; i--)
            {
                Enemy e = _alive[i];
                if (!e.IsAlive) { _alive.RemoveAt(i); continue; }
                int hit = pool.QueryHitEnemy(e.transform.position, e.HitRadius);
                if (hit >= 0)
                {
                    float dmg = pool.GetDamage(hit);
                    pool.Despawn(hit);
                    e.TakeDamage(dmg);
                }
            }
        }

        public void ClearAll()
        {
            for (int i = _alive.Count - 1; i >= 0; i--)
            {
                if (_alive[i] != null) Destroy(_alive[i].gameObject);
            }
            _alive.Clear();
        }
    }
}
