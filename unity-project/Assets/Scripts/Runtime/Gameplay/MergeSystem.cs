using System.Collections.Generic;
using UnityEngine;
using AirspaceEvacuation.Core;
using AirspaceEvacuation.Meta;
using AirspaceEvacuation.Meta.Config;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 局内合成系统（merge.md / E5.1）。
    /// 2合1：2×同稀同物 → 1×升1稀。
    /// 仅非战斗状态可合（merge.md §7 风险）；不产出空引用（M4 Blocker）。
    /// </summary>
    public class MergeSystem
    {
        private readonly MergeRecipeConfig _recipes;
        private readonly RunState _run;

        public MergeSystem(MergeRecipeConfig recipes, RunState run)
        {
            _recipes = recipes;
            _run = run;
        }

        /// <summary>
        /// 尝试合成两件同类同级战利品（M1 Blocker）。
        /// 返回合成产物 ItemId；失败返回 null。
        /// </summary>
        public string TryMerge(string itemId, int rarity, int slotA, int slotB)
        {
            if (_recipes == null || _run == null) return null;

            // 仅非战斗状态可合（GameFlow 需在 Merge/Buff/Scavenge 子状态，非 Combat）
            if (ServiceLocator.TryGet(out GameFlow flow))
            {
                if (flow.Mission == MissionState.Combat)
                {
                    Debug.LogWarning("[Merge] blocked in Combat (merge.md §7).");
                    return null;
                }
                flow.RequestMerge();
            }

            // 校验配方（M1/M3）
            if (!_recipes.TryFindRecipe(itemId, rarity, out MergeRecipe recipe))
            {
                Debug.LogWarning($"[Merge] no recipe for {itemId} rarity {rarity} (M2).");
                return null;
            }

            // 校验槽位有效且数量足够（M4 不产出空引用）
            if (slotA < 0 || slotA >= _run.Loot.Count || slotB < 0 || slotB >= _run.Loot.Count)
            {
                Debug.LogWarning("[Merge] invalid slots (M4).");
                return null;
            }
            InventoryItem a = _run.Loot[slotA];
            InventoryItem b = _run.Loot[slotB];
            if (a.ItemId != itemId || a.Rarity != rarity || a.Count < 1 ||
                b.ItemId != itemId || b.Rarity != rarity || b.Count < 1)
            {
                Debug.LogWarning("[Merge] slot content mismatch (M2/M4).");
                return null;
            }
            if (slotA == slotB)
            {
                // 同槽需 Count≥2
                if (a.Count < 2)
                {
                    Debug.LogWarning("[Merge] same slot needs Count>=2 (M1).");
                    return null;
                }
            }

            // 执行合成：消耗 2 件，产出 1 件升稀
            if (slotA == slotB)
            {
                a.Count -= 2;
                _run.Loot[slotA] = a;
                if (a.Count <= 0) _run.Loot.RemoveAt(slotA);
            }
            else
            {
                a.Count -= 1;
                b.Count -= 1;
                _run.Loot[slotA] = a;
                _run.Loot[slotB] = b;
                // 清空槽位后移除
                if (a.Count <= 0) _run.Loot.RemoveAt(slotA);
                if (b.Count <= 0 && slotB < _run.Loot.Count) _run.Loot.RemoveAt(slotB > slotA ? slotB - 1 : slotB);
            }

            // 产物入战利品栏（不入库存，M6）
            var output = new InventoryItem
            {
                ItemId = recipe.OutputItemId,
                Rarity = recipe.OutputRarity,
                Count = 1,
                Insured = false,
            };
            _run.AddLoot(output);

            // 完成事件（framework-scaffold §3.1 OnMergeCompleted）
            if (ServiceLocator.TryGet(out GameFlow f2))
                f2.CompleteMerge(recipe.OutputItemId, true);
            EventBus.Publish(new GameEvents.OnMergeCompleted { ResultItemId = recipe.OutputItemId, RecipeValid = true });

            return recipe.OutputItemId;
        }
    }
}
