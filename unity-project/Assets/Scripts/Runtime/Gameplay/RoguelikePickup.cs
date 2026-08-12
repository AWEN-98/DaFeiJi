using System.Collections.Generic;
using UnityEngine;
using AirspaceEvacuation.Core;
using AirspaceEvacuation.Meta;
using AirspaceEvacuation.Meta.Config;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 肉鸽随机强化（roguelike.md / E4.1）。
    /// 三选一限时 8s（roguelike.md §7），5 稀有度权重抽取，灵能槽限制（aircraft.md §3）。
    /// buff 离局清空，仅图鉴记录（R6）。
    /// </summary>
    public class RoguelikePickup : MonoBehaviour
    {
        [SerializeField] private RunePoolConfig runePool;
        [SerializeField] private AircraftConfig aircraftConfig;
        [SerializeField] private float choiceTimeLimit = RunePoolConfig.ChoiceTimeLimit;

        private readonly List<RuneDef> _activeRunes = new List<RuneDef>();
        private IRng _rng;
        private float _choiceTimer;
        private bool _choosing;
        private RuneDef[] _currentChoices;

        public int ActiveRuneCount => _activeRunes.Count;
        public IReadOnlyList<RuneDef> ActiveRunes => _activeRunes;

        private void Start()
        {
            if (runePool == null && ServiceLocator.TryGet(out RunePoolConfig rp)) runePool = rp;
            if (aircraftConfig == null && ServiceLocator.TryGet(out AircraftConfig ac)) aircraftConfig = ac;
            if (ServiceLocator.TryGet(out IRng rng)) _rng = rng;
            if (_rng == null) _rng = new PcgRng((uint)Random.Range(1, int.MaxValue));
        }

        /// <summary>触发三选一（击杀精英/Boss 阶段奖励/搜刮符文残片兑换）。</summary>
        public void TriggerChoice()
        {
            if (runePool == null || _activeRunes.Count >= aircraftConfig.Psionic)
            {
                // 灵能槽满（aircraft.md §3）→ 不再触发
                Debug.Log("[Roguelike] psionic slots full — skip choice.");
                return;
            }

            _currentChoices = RollThreeChoices();
            _choosing = true;
            _choiceTimer = choiceTimeLimit;
            // TODO: UI 弹三选一面板（P1 美术接入）
            Debug.Log($"[Roguelike] 3 choices: {_currentChoices[0].RuneId} / {_currentChoices[1].RuneId} / {_currentChoices[2].RuneId}");
        }

        private void Update()
        {
            if (!_choosing) return;
            _choiceTimer -= Time.deltaTime;
            if (_choiceTimer <= 0f)
            {
                // 超时自动选权重最高（roguelike.md §7）
                ApplyChoice(0);
            }
        }

        /// <summary>玩家选择（0/1/2）。</summary>
        public void ApplyChoice(int index)
        {
            if (!_choosing || _currentChoices == null) return;
            if (index < 0 || index >= _currentChoices.Length) index = 0;
            RuneDef chosen = _currentChoices[index];

            // 互斥 buff 不并存（R4）→ TODO: 检查互斥表，当前 P0 简化
            _activeRunes.Add(chosen);

            // 图鉴记录（不受惩罚，core-loop §2）
            if (ServiceLocator.TryGet(out MetaState meta))
            {
                if (!meta.DiscoveredRunes.Contains(chosen.RuneId))
                    meta.DiscoveredRunes.Add(chosen.RuneId);
            }
            if (ServiceLocator.TryGet(out RunState run))
                run.ActiveBuffs.Add(chosen.RuneId);

            EventBus.Publish(new GameEvents.OnBuffApplied { BuffId = chosen.RuneId, Rarity = (int)chosen.Rarity });
            _choosing = false;
            _currentChoices = null;
        }

        /// <summary>加权抽取三选一候选（roguelike.md §3 权重）。</summary>
        private RuneDef[] RollThreeChoices()
        {
            RuneDef[] result = new RuneDef[3];
            // 先按稀有度权重抽稀有度，再从该稀有度池随机取符文
            var byRarity = new Dictionary<RuneRarity, List<RuneDef>>();
            for (int i = 0; i < runePool.Runes.Count; i++)
            {
                RuneDef r = runePool.Runes[i];
                if (!byRarity.ContainsKey(r.Rarity)) byRarity[r.Rarity] = new List<RuneDef>();
                byRarity[r.Rarity].Add(r);
            }

            float[] rarityWeights = runePool.RarityWeights;
            for (int i = 0; i < 3; i++)
            {
                // 抽稀有度
                int rIdx = _rng.WeightedIndex(rarityWeights);
                RuneRarity rarity = (RuneRarity)rIdx;
                if (!byRarity.ContainsKey(rarity) || byRarity[rarity].Count == 0)
                {
                    // 降级到白
                    rarity = RuneRarity.White;
                    if (!byRarity.ContainsKey(rarity)) { result[i] = default; continue; }
                }
                var pool = byRarity[rarity];
                result[i] = pool[_rng.NextInt(0, pool.Count)];
            }
            return result;
        }

        /// <summary>离局清空（R6）。</summary>
        public void ClearRunBuffs()
        {
            _activeRunes.Clear();
            _choosing = false;
            _currentChoices = null;
        }
    }
}
