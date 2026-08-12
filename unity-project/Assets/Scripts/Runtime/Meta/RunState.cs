using System;
using System.Collections.Generic;
using UnityEngine;
using AirspaceEvacuation.Core;

namespace AirspaceEvacuation.Meta
{
    /// <summary>
    /// 局内运行状态（ADR-003 run.save）。
    /// 仅本地，用于崩溃恢复；不云同步。结算成功才合并入 MetaState。
    /// </summary>
    [Serializable]
    public class RunState
    {
        public bool Active = false;
        public bool Settled = false;        // 幂等标记（E7/G5）
        public uint Seed = 0;
        public string AircraftId = "";
        public List<LoadoutEntry> Loadout = new List<LoadoutEntry>();   // 带入装备（AT_RISK）
        public List<InventoryItem> Loot = new List<InventoryItem>();    // 战利品栏（不入库存）
        public List<string> ActiveBuffs = new List<string>();           // 局内 buff（离局清空，R6）
        public int RuntimeKills = 0;

        // —— 撤离读条状态 ——
        public float ExfilProgress = 0f;
        public bool ExfilInterrupted = false;

        public void BeginRun(uint seed, string aircraftId, LoadoutEntry[] loadout)
        {
            Active = true;
            Settled = false;
            Seed = seed;
            AircraftId = aircraftId;
            Loadout.Clear();
            if (loadout != null)
                for (int i = 0; i < loadout.Length; i++) Loadout.Add(loadout[i]);
            Loot.Clear();
            ActiveBuffs.Clear();
            RuntimeKills = 0;
            ExfilProgress = 0f;
            ExfilInterrupted = false;
        }

        public void EndRun()
        {
            Active = false;
            // 不清 Settled：保留用于幂等校验，下次 BeginRun 才重置
            Loot.Clear();
            ActiveBuffs.Clear();
            ExfilProgress = 0f;
        }

        /// <summary>添加战利品（不入库存，C5）。</summary>
        public void AddLoot(InventoryItem item)
        {
            for (int i = 0; i < Loot.Count; i++)
            {
                if (Loot[i].ItemId == item.ItemId && Loot[i].Rarity == item.Rarity)
                {
                    var it = Loot[i];
                    it.Count += item.Count;
                    Loot[i] = it;
                    return;
                }
            }
            Loot.Add(item);
        }
    }
}
