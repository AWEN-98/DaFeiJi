using UnityEngine;
using AirspaceEvacuation.Core;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// Boss 雏形占位（E3.3 / boss.md）。
    /// 三阶段切换钩子（按血量阈值）：P1 ≥66% / P2 ≥33% / P3 &lt;33%。
    /// P0 仅占位：每阶段弹幕模式不同（扇形/螺旋/追踪），退场清残留弹（S6）。
    /// TODO: 完整 Boss 弹幕模式与首杀掉落（P1）。
    /// </summary>
    public class BossStub : Entity
    {
        public enum Phase { P1, P2, P3, Dead }

        [SerializeField] private float phase1Threshold = 0.66f;
        [SerializeField] private float phase2Threshold = 0.33f;
        [SerializeField] private float fireInterval = 0.8f;
        [SerializeField] private SpriteRenderer bodyRenderer;

        public Phase CurrentPhase { get; private set; } = Phase.P1;
        private Transform _target;
        private BulletPool _pool;
        private float _fireTimer;
        private int _phaseFireCount;

        protected override void Awake()
        {
            base.Awake();
            faction = Faction.Enemy;
            maxHp = 600f;
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

            UpdatePhase();

            _fireTimer -= Time.deltaTime;
            if (_fireTimer <= 0f)
            {
                _fireTimer = fireInterval;
                FirePattern();
            }
        }

        private void UpdatePhase()
        {
            float ratio = Hp / maxHp;
            Phase next = CurrentPhase;
            if (ratio <= phase2Threshold) next = Phase.P3;
            else if (ratio <= phase1Threshold) next = Phase.P2;
            else next = Phase.P1;

            if (next != CurrentPhase)
            {
                CurrentPhase = next;
                OnPhaseChanged();
            }
        }

        private void OnPhaseChanged()
        {
            // 阶段切换钩子（boss.md / S1 Blocker）
            // 退场清残留弹（S6）：阶段切换时清所有敌弹避免误伤
            if (_pool != null)
            {
                // 仅清敌弹（不清玩家弹，避免削弱）
                _pool.DespawnAll(); // P0 简化：全清；演进按 faction 过滤
            }
            fireInterval = CurrentPhase == Phase.P1 ? 0.9f : CurrentPhase == Phase.P2 ? 0.6f : 0.4f;
        }

        // —— 三阶段弹幕模式占位 ——
        private void FirePattern()
        {
            if (_pool == null) return;
            Vector2 basePos = transform.position;
            Vector2 toPlayer = ((Vector2)_target.position - basePos).normalized;

            switch (CurrentPhase)
            {
                case Phase.P1:
                    // 扇形 5 弹
                    for (int i = -2; i <= 2; i++)
                    {
                        float ang = Mathf.Atan2(toPlayer.y, toPlayer.x) + i * 0.2f;
                        var dir = new Vector2(Mathf.Cos(ang), Mathf.Sin(ang));
                        _pool.Spawn(basePos, dir * 7f, 8f, Faction.Enemy);
                    }
                    break;
                case Phase.P2:
                    // 螺旋 8 弹
                    _phaseFireCount++;
                    float baseAng = _phaseFireCount * 0.3f;
                    for (int i = 0; i < 8; i++)
                    {
                        float ang = baseAng + i * (Mathf.PI * 2f / 8f);
                        var dir = new Vector2(Mathf.Cos(ang), Mathf.Sin(ang));
                        _pool.Spawn(basePos, dir * 6f, 8f, Faction.Enemy);
                    }
                    break;
                case Phase.P3:
                    // 追踪 3 弹
                    for (int i = 0; i < 3; i++)
                    {
                        float spread = (i - 1) * 0.15f;
                        var dir = Rotate(toPlayer, spread);
                        _pool.Spawn(basePos, dir * 9f, 10f, Faction.Enemy);
                    }
                    break;
            }
        }

        private static Vector2 Rotate(Vector2 v, float rad)
        {
            float c = Mathf.Cos(rad), s = Mathf.Sin(rad);
            return new Vector2(v.x * c - v.y * s, v.x * s + v.y * c);
        }

        protected override void OnDeath()
        {
            base.OnDeath();
            CurrentPhase = Phase.Dead;
            // 退场清残留弹不误伤（S6）
            if (_pool != null) _pool.DespawnAll();
            // Boss 首杀掉落必带回（core-loop §3.2）→ 触发拾取事件
            EventBus.Publish(new GameEvents.OnPickup
            {
                ItemId = "boss_first_blood_relic",
                LootSlot = 0,
                Rarity = 4, // 橙
            });
        }

        private void EnsurePlaceholderVisual()
        {
            if (bodyRenderer == null)
            {
                var go = new GameObject("BossBody");
                go.transform.SetParent(transform, false);
                bodyRenderer = go.AddComponent<SpriteRenderer>();
                bodyRenderer.color = new Color(0.6f, 0.2f, 0.8f);
                bodyRenderer.transform.localScale = new Vector3(2f, 2f, 1f);
            }
        }
    }
}
