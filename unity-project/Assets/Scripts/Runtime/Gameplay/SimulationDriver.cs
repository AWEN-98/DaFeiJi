using UnityEngine;
using AirspaceEvacuation.Core;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 仿真驱动器（ADR-002 Simulation 层 / main-architecture §3）。
    /// 固定步长累加器（60Hz）更新 BulletPool，保证确定性（core-loop §确定性）。
    /// 挂载在 Bootstrap 场景；PlayerAircraft/Enemy 各自 Update 内调用 BulletPool.Spawn，
    /// 碰撞在此处统一处理（B1 Blocker）。
    /// </summary>
    public class SimulationDriver : MonoBehaviour
    {
        [SerializeField] private float fixedStep = 1f / 60f;
        [SerializeField] private int maxStepsPerFrame = 3;
        [SerializeField] private PlayerAircraft player;
        [SerializeField] private EnemySpawner enemySpawner;

        private float _accumulator;
        private double _lastTime;
        private float _stepTimer;

        public BulletPool Pool { get; private set; }
        public BulletRenderer Renderer { get; private set; }

        private void Awake()
        {
            Pool = new BulletPool(3000);
            Renderer = GetComponent<BulletRenderer>() ?? gameObject.AddComponent<BulletRenderer>();
            Renderer.Init(Pool);
            ServiceLocator.Register<ISimulationBackend>(Pool);
            ServiceLocator.Register(Pool);
            _lastTime = Time.timeAsDouble;
        }

        private void Update()
        {
            double now = Time.timeAsDouble;
            float frameDelta = (float)(now - _lastTime);
            _lastTime = now;
            _accumulator += frameDelta;

            int steps = 0;
            while (_accumulator >= fixedStep && steps < maxStepsPerFrame)
            {
                Pool.Step(fixedStep);
                ResolveCollisions();
                _accumulator -= fixedStep;
                steps++;
                _stepTimer += fixedStep;
            }

            // 每秒发一次 OnCombatTick（framework-scaffold §3.1）
            if (_stepTimer >= 1f)
            {
                _stepTimer = 0f;
                EventBus.Publish(new GameEvents.OnCombatTick
                {
                    BulletCount = Pool.ActiveCount,
                    EnemyCount = enemySpawner != null ? enemySpawner.ActiveCount : 0,
                });
            }
        }

        /// <summary>统一碰撞解析（B1 Blocker / B4 玩家子弹不误伤自身）。</summary>
        private void ResolveCollisions()
        {
            if (player == null || !player.IsAlive) return;

            // 敌方弹 → 玩家
            int hit = Pool.QueryHitPlayer(player.transform.position, player.HitRadius);
            if (hit >= 0)
            {
                float dmg = Pool.GetDamage(hit);
                Pool.Despawn(hit);
                if (player.TakeDamage(dmg))
                {
                    // 命中反馈钩子（音频/特效订阅）
                }
            }

            // 玩家弹 → 敌人
            if (enemySpawner != null)
            {
                enemySpawner.ResolveBulletHits(Pool);
            }
        }

        public void Bind(PlayerAircraft p, EnemySpawner spawner)
        {
            player = p;
            enemySpawner = spawner;
        }
    }
}
