using System;
using System.Collections.Generic;
using UnityEngine;

namespace AirspaceEvacuation.Meta
{
    /// <summary>
    /// 元进度状态（ADR-003 Meta 层 / E1.1）。
    /// 纯 C# 数据，不依赖 MonoBehaviour。对应 main-architecture §1 Meta/Progression。
    /// 字段约定：货币/声望/解锁树/库存/图鉴/统计，满级封顶非负（G6）。
    /// </summary>
    [Serializable]
    public class MetaState
    {
        // —— 经济 ——
        public int Currency = 0;            // 灵玉
        public int Reputation = 0;          // 基地声望（解锁用）
        public int LowCurrencyStreak = 0;   // 连续全损局数（保底用，core-loop §3.3）

        // —— 解锁树 ——
        public List<string> UnlockedAircrafts = new List<string> { "qingzhui" }; // 默认解锁青隼
        public List<string> UnlockedNodes = new List<string>();

        // —— 库存 ——
        public List<InventoryItem> Inventory = new List<InventoryItem>();

        // —— 图鉴（不受惩罚，core-loop §2）——
        public List<string> DiscoveredRunes = new List<string>();
        public List<string> DiscoveredEnemies = new List<string>();

        // —— 统计 ——
        public int TotalRuns = 0;
        public int SuccessRuns = 0;
        public int FailedRuns = 0;
        public int TotalKills = 0;

        // —— 上限（G6 值域校验）——
        public const int CurrencyCap = 9999999;
        public const int ReputationCap = 999999;

        /// <summary>加载时值域校正（G6：满级封顶、非负、枚举合法）。</summary>
        public void ClampValues()
        {
            Currency = Mathf.Clamp(Currency, 0, CurrencyCap);
            Reputation = Mathf.Clamp(Reputation, 0, ReputationCap);
            LowCurrencyStreak = Mathf.Max(0, LowCurrencyStreak);
            if (UnlockedAircrafts == null) UnlockedAircrafts = new List<string> { "qingzhui" };
            if (Inventory == null) Inventory = new List<InventoryItem>();
            for (int i = 0; i < Inventory.Count; i++)
            {
                InventoryItem it = Inventory[i];
                it.Count = Mathf.Max(0, it.Count);
                Inventory[i] = it;
            }
        }

        public bool IsAircraftUnlocked(string id) => UnlockedAircrafts.Contains(id);

        public void UnlockAircraft(string id)
        {
            if (!UnlockedAircrafts.Contains(id)) UnlockedAircrafts.Add(id);
        }

        public void AddCurrency(int amount)
        {
            Currency = Mathf.Clamp(Currency + amount, 0, CurrencyCap);
        }

        public void AddReputation(int amount)
        {
            Reputation = Mathf.Clamp(Reputation + amount, 0, ReputationCap);
        }
    }

    /// <summary>库存物品（aircraft.md 装备/模组/素材）。</summary>
    [Serializable]
    public struct InventoryItem
    {
        public string ItemId;
        public int Rarity;      // 0=白 1=绿 2=蓝 3=紫 4=橙
        public int Count;
        public bool Insured;    // 保险槽标记（core-loop §3.2）
    }
}
