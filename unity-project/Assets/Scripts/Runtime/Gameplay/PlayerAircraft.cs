using UnityEngine;
using AirspaceEvacuation.Core;
using AirspaceEvacuation.Meta.Config;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 玩家机体（aircraft.md / E3.2）。
    /// 移动 + 射击 + 闪避 i-frame≤0.3s，读 IInputProvider（ADR-005）。
    /// 子弹通过 BulletPool.Spawn 入池，不直接创建 GameObject。
    /// </summary>
    [RequireComponent(typeof(Rigidbody2D))]
    public class PlayerAircraft : Entity
    {
        [SerializeField] private AircraftConfig config;
        [SerializeField] private float hitRadius = 0.35f;
        [SerializeField] private SpriteRenderer bodyRenderer; // 占位

        private IInputProvider _input;
        private BulletPool _pool;
        private float _fireTimer;
        private float _dashCdTimer;
        private bool _dashing;
        private float _dashTime;
        private Vector2 _dashDir;

        public float HitRadius => hitRadius;
        public AircraftConfig Config => config;

        protected override void Awake()
        {
            base.Awake();
            faction = Faction.Player;
            if (config != null)
            {
                maxHp = config.MaxHp;
                maxShield = config.MaxShield;
                Hp = maxHp;
                Shield = maxShield;
            }
            EnsurePlaceholderVisual();
        }

        private void Start()
        {
            if (ServiceLocator.TryGet(out IInputProvider inp)) _input = inp;
            if (ServiceLocator.TryGet(out BulletPool pool)) _pool = pool;
        }

        public void SetInputProvider(IInputProvider provider)
        {
            _input = provider;
        }

        public void BindPool(BulletPool pool)
        {
            _pool = pool;
        }

        private void Update()
        {
            base.Update();
            if (_input == null || !IsAlive) return;

            Vector2 move = _input.Move;
            Vector2 aim = _input.Aim;

            // 闪避（边缘触发）
            if (_input.DashPressed && _dashCdTimer <= 0f && !_dashing)
            {
                _dashing = true;
                _dashTime = config != null ? config.DashDuration : 0.18f;
                _dashDir = move.sqrMagnitude > 0.01f ? move.normalized : (aim.sqrMagnitude > 0.01f ? aim : Vector2.up);
                SetInvincible(config != null ? config.DashIFrame : 0.3f);
                _dashCdTimer = config != null ? config.DashCooldown : 1.2f;
            }
            _input.ConsumeEdgeTriggers();

            if (_dashCdTimer > 0f) _dashCdTimer -= Time.deltaTime;

            // 移动
            float speed = config != null ? config.MoveSpeed : 7.5f;
            if (_dashing)
            {
                float dashSpeed = (config != null ? config.DashDistance : 4f) / (config != null ? config.DashDuration : 0.18f);
                transform.position += (Vector3)(_dashDir * dashSpeed * Time.deltaTime);
                _dashTime -= Time.deltaTime;
                if (_dashTime <= 0f) _dashing = false;
            }
            else
            {
                transform.position += (Vector3)(move * speed * Time.deltaTime);
            }

            // 射击
            _fireTimer -= Time.deltaTime;
            if (_input.FireHeld && _fireTimer <= 0f && aim.sqrMagnitude > 0.01f)
            {
                Fire(aim);
                _fireTimer = config != null ? config.FireInterval : 0.12f;
            }
        }

        private void Fire(Vector2 dir)
        {
            if (_pool == null) return;
            float speed = config != null ? config.BulletSpeed : 22f;
            float dmg = config != null ? config.BulletDamage : 8f;
            _pool.Spawn(transform.position, dir.normalized * speed, dmg, Faction.Player);
        }

        protected override void OnDeath()
        {
            base.OnDeath();
            // 触发阵亡结算 → GameFlow.ResolveRun(Death)
            if (ServiceLocator.TryGet(out GameFlow flow) && flow.State == GameState.Mission)
            {
                flow.ResolveRun(ExfilResult.Death);
            }
        }

        // —— 占位视觉：用 SpriteRenderer 画个三角形/方块区分 ——
        private void EnsurePlaceholderVisual()
        {
            if (bodyRenderer == null)
            {
                var go = new GameObject("PlayerBody");
                go.transform.SetParent(transform, false);
                bodyRenderer = go.AddComponent<SpriteRenderer>();
                bodyRenderer.color = new Color(0.3f, 0.8f, 1f);
                bodyRenderer.transform.localScale = new Vector3(0.7f, 0.9f, 1f);
            }
        }
    }
}
