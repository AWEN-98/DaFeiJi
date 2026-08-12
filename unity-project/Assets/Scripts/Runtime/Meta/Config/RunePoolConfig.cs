using System;
using System.Collections.Generic;
using UnityEngine;

namespace AirspaceEvacuation.Meta.Config
{
    /// <summary>
    /// 符文池配置（roguelike.md / E4.1）。
    /// v1 占位 24 符文，覆盖 5 系（火/水/雷/风/煞）。
    /// 5 稀有度：白/绿/蓝/紫/橙，权重 100/60/30/10/3（roguelike.md §3）。
    /// </summary>
    public enum RuneSeries { Fire, Water, Thunder, Wind, Bane }
    public enum RuneRarity { White = 0, Green = 1, Blue = 2, Purple = 3, Orange = 4 }

    [Serializable]
    public struct RuneDef
    {
        public string RuneId;
        public string DisplayName;
        public RuneSeries Series;
        public RuneRarity Rarity;
        [TextArea] public string EffectDesc;
        public float StrengthBase;     // 基础强度（× rarity_mult）
        public bool IsActive;          // 主动/被动
    }

    [CreateAssetMenu(fileName = "RunePoolConfig", menuName = "AirspaceEvac/Rune Pool Config", order = 2)]
    public class RunePoolConfig : ScriptableObject
    {
        [Header("稀有度权重（roguelike.md §3）")]
        public float[] RarityWeights = new float[] { 100f, 60f, 30f, 10f, 3f };

        [Header("稀有度强度倍率")]
        public float[] RarityMultipliers = new float[] { 1.0f, 1.3f, 1.7f, 2.2f, 3.0f };

        [Header("符文池（v1 占位 24 个）")]
        public List<RuneDef> Runes = new List<RuneDef>();

        /// <summary>三选一限时 8s（roguelike.md §7）。</summary>
        public const float ChoiceTimeLimit = 8f;

        private void Reset()
        {
            if (Runes == null) Runes = new List<RuneDef>();
            if (Runes.Count > 0) return;
            // 生成 24 个占位符文：5 系 × ~5 个，覆盖 5 稀有度
            string[] seriesNames = Enum.GetNames(typeof(RuneSeries));
            for (int i = 0; i < 24; i++)
            {
                RuneSeries series = (RuneSeries)(i % 5);
                RuneRarity rarity = (RuneRarity)(i % 5);
                Runes.Add(new RuneDef
                {
                    RuneId = "rune_" + i.ToString("D2"),
                    DisplayName = seriesNames[(int)series] + (i / 5 + 1),
                    Series = series,
                    Rarity = rarity,
                    EffectDesc = "占位符文 " + i + "，待填效果。",
                    StrengthBase = 1f + i * 0.1f,
                    IsActive = (i % 2 == 0),
                });
            }
        }

        public float WeightOf(RuneRarity r)
        {
            int idx = (int)r;
            if (RarityWeights == null || idx < 0 || idx >= RarityWeights.Length) return 0f;
            return RarityWeights[idx];
        }

        public float MultiplierOf(RuneRarity r)
        {
            int idx = (int)r;
            if (RarityMultipliers == null || idx < 0 || idx >= RarityMultipliers.Length) return 1f;
            return RarityMultipliers[idx];
        }
    }
}
