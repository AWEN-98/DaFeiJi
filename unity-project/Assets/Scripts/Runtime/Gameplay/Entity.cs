using UnityEngine;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 实体基类（ADR-002 Simulation 层 / E3）。
    /// 局内所有活动单位（玩家/敌人/Boss）的共性：血量/护盾/位置/朝向/阵营。
    /// 子类负责具体行为；基类只管状态字段与受击接口。
    /// </summary>
    public abstract class Entity : MonoBehaviour
    {
        public enum Faction { Player, Enemy, Neutral }

        [SerializeField] protected Faction faction = Faction.Neutral;
        [SerializeField] protected float maxHp = 100f;
        [SerializeField] protected float maxShield = 0f;

        public float Hp { get; protected set; }
        public float Shield { get; protected set; }
        public bool IsAlive => Hp > 0f;
        public Faction Group => faction;

        // i-frame（无敌帧，aircraft.md §7）
        public bool IsInvincible { get; protected set; }
        protected float iFrameTimer = 0f;

        protected virtual void Awake()
        {
            Hp = maxHp;
            Shield = maxShield;
        }

        protected virtual void Update()
        {
            if (iFrameTimer > 0f)
            {
                iFrameTimer -= Time.deltaTime;
                if (iFrameTimer <= 0f) IsInvincible = false;
            }
        }

        /// <summary>受击接口（B1 Blocker）。返回是否真的命中（被 i-frame 拒绝则 false）。</summary>
        public virtual bool TakeDamage(float amount)
        {
            if (!IsAlive || IsInvincible) return false;
            if (Shield > 0f)
            {
                float toShield = Mathf.Min(Shield, amount);
                Shield -= toShield;
                amount -= toShield;
            }
            if (amount > 0f) Hp -= amount;
            if (Hp <= 0f) OnDeath();
            return true;
        }

        protected virtual void OnDeath()
        {
            Hp = 0f;
            // 子类可覆盖以触发掉落/事件
        }

        public void SetInvincible(float duration)
        {
            IsInvincible = true;
            iFrameTimer = Mathf.Max(iFrameTimer, duration);
        }
    }
}
