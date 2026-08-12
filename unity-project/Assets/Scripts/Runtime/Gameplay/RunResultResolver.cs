using UnityEngine;
using AirspaceEvacuation.Core;
using AirspaceEvacuation.Meta;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 结算解析器（core-loop §3 / E6.2）。
    /// 成功100% / 阵亡85% / 弃局70% + 保险槽例外（core-loop §3.2）。
    /// 写 MetaState（货币/库存/统计/图鉴），返回 MetaDelta 供 OnMetaSettled。
    /// 幂等：run.Settled 标记后不再结算（E7/G5）。
    /// </summary>
    public class RunResultResolver
    {
        private const float LossRatioDeath = 0.85f;   // 阵亡/超时损失 85%
        private const float LossRatioAbandon = 0.70f; // 弃局损失 70%
        private const float LossRatioSuccess = 0f;    // 成功 0 损失

        /// <summary>
        /// 执行结算，返回 MetaDelta。
        /// </summary>
        public MetaDelta Resolve(ExfilResult result, MetaState meta, RunState run)
        {
            // 幂等校验（E7/G5）
            if (run.Settled)
            {
                Debug.LogWarning("[Resolver] run already settled — skip (E7).");
                return new MetaDelta { Settled = true };
            }
            run.Settled = true;

            float lossRatio;
            switch (result)
            {
                case ExfilResult.Success: lossRatio = LossRatioSuccess; break;
                case ExfilResult.Death:
                case ExfilResult.Timeout: lossRatio = LossRatioDeath; break;
                case ExfilResult.Abandon: lossRatio = LossRatioAbandon; break;
                default: lossRatio = LossRatioDeath; break;
            }

            int itemsReturned = 0;
            int itemsLost = 0;
            int currencyDelta = 0;

            // —— 带入装备按损失比例处理（core-loop §3.1）——
            if (run.Loadout != null)
            {
                for (int i = 0; i < run.Loadout.Count; i++)
                {
                    LoadoutEntry entry = run.Loadout[i];
                    if (result == ExfilResult.Success)
                    {
                        entry.State = LoadoutItemState.Returned;
                        itemsReturned++;
                        // 回库存
                        meta.Inventory.Add(new InventoryItem
                        {
                            ItemId = entry.ItemId,
                            Rarity = 0,
                            Count = 1,
                            Insured = false,
                        });
                    }
                    else
                    {
                        // 保险槽例外（core-loop §3.2）：Insured 必返还
                        // TODO: 查 InventoryItem.Inured 标记（需带入时记录）；P0 简化为不丢
                        bool insured = IsInsured(entry.ItemId, meta);
                        if (insured)
                        {
                            entry.State = LoadoutItemState.Returned;
                            itemsReturned++;
                            meta.Inventory.Add(new InventoryItem
                            {
                                ItemId = entry.ItemId,
                                Rarity = 0,
                                Count = 1,
                                Insured = false,
                            });
                        }
                        else
                        {
                            entry.State = LoadoutItemState.Lost;
                            itemsLost++;
                        }
                    }
                    run.Loadout[i] = entry;
                }
            }

            // —— 局内拾取：成功才入库，失败全失（core-loop §3.1）——
            if (result == ExfilResult.Success && run.Loot != null)
            {
                for (int i = 0; i < run.Loot.Count; i++)
                {
                    InventoryItem loot = run.Loot[i];
                    meta.Inventory.Add(loot);
                    itemsReturned += loot.Count;
                    // 灵玉类物品折算货币（extraction.md §4）
                    if (loot.ItemId == "loot_currency" || loot.ItemId == "loot_scrap")
                        currencyDelta += loot.Count * 10;
                }
            }
            else
            {
                // 失败：战利品清空（已在 run.EndRun 处理）；统计/图鉴仍写（不受惩罚）
            }

            // —— 统计写入（不受惩罚，core-loop §2）——
            meta.TotalRuns++;
            if (result == ExfilResult.Success)
            {
                meta.SuccessRuns++;
                meta.LowCurrencyStreak = 0;
            }
            else
            {
                meta.FailedRuns++;
                meta.LowCurrencyStreak++;
            }
            meta.TotalKills += run.RuntimeKills;

            // —— 货币入账 ——
            meta.AddCurrency(currencyDelta);

            // —— 保底规则（core-loop §3.3）——
            if (meta.LowCurrencyStreak >= 2)
            {
                // 第 3 局：免费保险装 + 符文池权重提升（占位）
                Debug.Log("[Resolver] pity triggered: 2 consecutive full-loss — grant insurance item.");
                // TODO: 发放免费保险装（core-loop §3.3）
            }
            if (meta.Inventory.Count <= 1 && meta.Currency < 50)
            {
                // 求生包：1 白装武器 + 1 白装模组
                meta.Inventory.Add(new InventoryItem { ItemId = "wpn_survival", Rarity = 0, Count = 1 });
                meta.Inventory.Add(new InventoryItem { ItemId = "mod_survival", Rarity = 0, Count = 1 });
                Debug.Log("[Resolver] survival kit granted (core-loop §3.3).");
            }

            var delta = new MetaDelta
            {
                CurrencyDelta = currencyDelta,
                ReputationDelta = result == ExfilResult.Success ? 5 : 1,
                LossRatio = lossRatio,
                ItemsReturned = itemsReturned,
                ItemsLost = itemsLost,
                Settled = true,
            };
            meta.AddReputation(delta.ReputationDelta);
            return delta;
        }

        /// <summary>保险槽判定（core-loop §3.2）。P0 占位：剧情/教程装备免疫损失。</summary>
        private bool IsInsured(string itemId, MetaState meta)
        {
            // 前 3 局教学装备免疫（core-loop §3.2）
            if (meta.TotalRuns < 3 && itemId != null && itemId.StartsWith("wpn_"))
                return true;
            // Boss 首杀专属素材必带回（core-loop §3.2）
            if (itemId == "boss_first_blood_relic")
                return true;
            return false;
        }
    }
}
