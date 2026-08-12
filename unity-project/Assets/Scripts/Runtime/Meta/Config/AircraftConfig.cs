using UnityEngine;

namespace AirspaceEvacuation.Meta.Config
{
    /// <summary>
    /// 机体配置（aircraft.md / E1.1）。
    /// ScriptableObject 静态配置，纯数据，ADR-002 Meta 层。
    /// 示例 1 架"青隼"（突击型：2 武器槽 / 1 模组槽 / 中灵能 / 冲刺+短无敌）。
    /// </summary>
    [CreateAssetMenu(fileName = "AircraftConfig", menuName = "AirspaceEvac/Aircraft Config", order = 1)]
    public class AircraftConfig : ScriptableObject
    {
        public string AircraftId = "qingzhui";
        public string DisplayName = "青隼";
        [TextArea] public string Description = "突击型机体，高火力低护盾，冲刺附带短无敌。";

        [Header("八维属性（1-10 档位，aircraft.md §4）")]
        public int Mobility = 7;        // 机动
        public int Firepower = 8;       // 火力
        public int FireRate = 6;        // 射速
        public int Shield = 4;          // 护盾
        public int Evasion = 7;         // 闪避
        public int WeaponSlots = 2;     // 武器槽
        public int ModuleSlots = 1;     // 模组槽
        public int Psionic = 5;         // 灵能（符文容量）
        public int HitVolume = 5;       // 体积（命中体积）

        [Header("数值")]
        public float MaxHp = 100f;
        public float MaxShield = 50f;
        public float MoveSpeed = 7.5f;       // 单位/秒
        public float FireInterval = 0.12f;   // 秒
        public float BulletSpeed = 22f;
        public float BulletDamage = 8f;

        [Header("闪避技")]
        public string DashName = "冲刺短无敌";
        public float DashDistance = 4f;
        public float DashDuration = 0.18f;
        public float DashIFrame = 0.3f;      // i-frame 上限 0.3s（aircraft.md §7）
        public float DashCooldown = 1.2f;

        [Header("解锁")]
        public int UnlockReputation = 0;     // 青隼默认解锁
        public int UnlockCost = 0;
    }
}
