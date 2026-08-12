using System;
using System.Collections.Generic;
using UnityEngine;

namespace AirspaceEvacuation.Meta.Config
{
    /// <summary>
    /// 合成配方配置（merge.md / E5.1）。
    /// 局内 2合1：2×同稀同物 → 1×升1稀。
    /// TODO: 3合1 / 跨系合 / 基地熔炼（merge.md §3，P1+）。
    /// </summary>
    [Serializable]
    public struct MergeRecipe
    {
        public string InputItemId;      // 同类物品 ID
        public int InputRarity;         // 输入稀有度
        public int InputCount;          // 2合1（在 Reset 中设为 2，struct 字段不可有初始化器）
        public string OutputItemId;     // 产物 ID（默认同 ID 升稀）
        public int OutputRarity;        // 输出稀有度 = Input+1
        public float OutputStatBonus;   // 属性加成（merge.md §4 升稀倍率）
    }

    [CreateAssetMenu(fileName = "MergeRecipeConfig", menuName = "AirspaceEvac/Merge Recipe Config", order = 3)]
    public class MergeRecipeConfig : ScriptableObject
    {
        [Header("升稀倍率（equipment.md，白→绿 1.2×…）")]
        public float[] RarityUpgradeMultipliers = new float[] { 1.2f, 1.4f, 1.6f, 1.8f, 2.0f };

        [Header("配方表（2合1）")]
        public List<MergeRecipe> Recipes = new List<MergeRecipe>();

        /// <summary>连锁奖励：每多 1 链 +5%，封顶 +20%（merge.md §4）。</summary>
        public const float ChainBonusPerLink = 0.05f;
        public const float ChainBonusCap = 0.20f;

        private void Reset()
        {
            if (Recipes == null) Recipes = new List<MergeRecipe>();
            if (Recipes.Count > 0) return;
            // 2 个示例配方（merge.md §3）
            Recipes.Add(new MergeRecipe
            {
                InputItemId = "wpn_basic_cannon",
                InputRarity = 0,
                InputCount = 2,
                OutputItemId = "wpn_basic_cannon",
                OutputRarity = 1,
                OutputStatBonus = 1.2f,
            });
            Recipes.Add(new MergeRecipe
            {
                InputItemId = "mod_shield_cell",
                InputRarity = 0,
                InputCount = 2,
                OutputItemId = "mod_shield_cell",
                OutputRarity = 1,
                OutputStatBonus = 1.2f,
            });
        }

        public bool TryFindRecipe(string itemId, int rarity, out MergeRecipe recipe)
        {
            for (int i = 0; i < Recipes.Count; i++)
            {
                if (Recipes[i].InputItemId == itemId && Recipes[i].InputRarity == rarity)
                {
                    recipe = Recipes[i];
                    return true;
                }
            }
            recipe = default;
            return false;
        }

        public float UpgradeMultiplier(int rarity)
        {
            if (rarity < 0 || rarity >= RarityUpgradeMultipliers.Length) return 1f;
            return RarityUpgradeMultipliers[rarity];
        }
    }
}
