using UnityEngine;
using AirspaceEvacuation.Meta;

namespace AirspaceEvacuation.Core
{
    /// <summary>
    /// 核心循环状态机（main-architecture.md §2 / core-loop.md §1）。
    /// 阶段：Boot → Base → Loadout → Mission → Result → Meta → Base（循环）
    /// Mission 内含子状态：Scavenge / Combat / Buff / Merge / Exfil / Resolved
    /// 所有迁移经 EventBus 发钩子（framework-scaffold §3.1），保证串行不竞态（X7）。
    /// </summary>
    public enum GameState
    {
        Boot,
        Base,
        SelectAircraft,
        Loadout,
        SelectMap,
        Mission,
        Result,
        Meta,
    }

    public enum MissionState
    {
        None,
        Scavenge,
        Combat,
        Buff,
        Merge,
        Exfil,
        Resolved,
    }

    /// <summary>状态迁移原因，便于测试断言与日志。</summary>
    public enum TransitionReason
    {
        BootComplete,
        EnterBase,
        AircraftConfirmed,
        LoadoutConfirmed,
        MapSelected,
        MissionStart,
        MissionToCombat,
        MissionToScavenge,
        BuffTriggered,
        BuffDone,
        MergeRequested,
        MergeDone,
        ExfilTriggered,
        ExfilResolved,
        RunFailed,
        ReturnToBase,
    }

    public class GameFlow
    {
        public GameState State { get; private set; } = GameState.Boot;
        public MissionState Mission { get; private set; } = MissionState.None;

        // 局间上下文（进图前写入，结算后清空）
        public string PendingAircraftId { get; private set; }
        public LoadoutEntry[] PendingLoadout { get; private set; }
        public uint PendingSeed { get; private set; }
        public int PendingRiskTier { get; private set; }
        public string PendingMissionId { get; private set; }

        private readonly MetaState _meta;
        private readonly RunState _run;

        public GameFlow(MetaState meta, RunState run)
        {
            _meta = meta;
            _run = run;
        }

        // —— 顶层状态迁移 ——
        public void CompleteBoot()
        {
            AssertState(GameState.Boot);
            State = GameState.Base;
            EventBus.Publish(new GameEvents.OnEnterBase());
        }

        public void ConfirmAircraft(string aircraftId)
        {
            if (State != GameState.Base && State != GameState.SelectAircraft) return;
            PendingAircraftId = aircraftId;
            State = GameState.Loadout;
            EventBus.Publish(new GameEvents.OnAircraftLocked { AircraftId = aircraftId });
        }

        public void ConfirmLoadout(LoadoutEntry[] loadout)
        {
            AssertState(GameState.Loadout);
            // 进图瞬间锁定为在险（core-loop §2）
            for (int i = 0; i < loadout.Length; i++)
                loadout[i].State = LoadoutItemState.AtRisk;
            PendingLoadout = loadout;
            State = GameState.SelectMap;
            EventBus.Publish(new GameEvents.OnLoadoutConfirmed { Loadout = loadout });
        }

        public void ConfirmMap(uint seed, int riskTier)
        {
            AssertState(GameState.SelectMap);
            PendingSeed = seed;
            PendingRiskTier = riskTier;
            State = GameState.Mission;
            Mission = MissionState.Scavenge;
            PendingMissionId = "M_" + seed.ToString("X8");
            _run.BeginRun(seed, PendingAircraftId, PendingLoadout);
            EventBus.Publish(new GameEvents.OnMapSelected { Seed = seed, RiskTier = riskTier });
            EventBus.Publish(new GameEvents.OnMissionStart { MissionId = PendingMissionId, Seed = seed });
        }

        // —— Mission 子状态 ——
        public void EnterCombat() { Mission = MissionState.Combat; }
        public void EnterScavenge() { Mission = MissionState.Scavenge; }

        public void TriggerBuff(string buffId, int rarity)
        {
            Mission = MissionState.Buff;
            EventBus.Publish(new GameEvents.OnBuffApplied { BuffId = buffId, Rarity = rarity });
        }

        public void RequestMerge()
        {
            // 仅非战斗时可合（merge.md §7 风险）
            if (Mission == MissionState.Combat)
            {
                Debug.LogWarning("[GameFlow] Merge blocked in Combat state (merge.md §7).");
                return;
            }
            Mission = MissionState.Merge;
        }

        public void CompleteMerge(string resultItemId, bool recipeValid)
        {
            EventBus.Publish(new GameEvents.OnMergeCompleted { ResultItemId = resultItemId, RecipeValid = recipeValid });
            Mission = MissionState.Scavenge;
        }

        public void TriggerExfil(string exfilPointId)
        {
            Mission = MissionState.Exfil;
            EventBus.Publish(new GameEvents.OnExfilTriggered { ExfilPointId = exfilPointId });
        }

        /// <summary>结算判定（成功/阵亡/超时/弃局），由 RunResultResolver 调用。</summary>
        public void ResolveRun(ExfilResult result)
        {
            if (Mission == MissionState.Resolved)
            {
                // 幂等：一次撤离只结算一次（E7 Blocker）
                Debug.LogWarning("[GameFlow] ResolveRun called twice — ignored (E7 idempotent).");
                return;
            }
            Mission = MissionState.Resolved;
            EventBus.Publish(new GameEvents.OnExfilResult { Result = result });
            if (result != ExfilResult.Success)
                EventBus.Publish(new GameEvents.OnRunFailed { Reason = result });
            State = GameState.Result;
        }

        /// <summary>结算完成 → 写元进度 → 回基地。</summary>
        public void FinishResultAndReturnToBase(MetaDelta delta)
        {
            AssertState(GameState.Result);
            EventBus.Publish(new GameEvents.OnMetaSettled { Delta = delta });
            State = GameState.Meta;
            // 清局间上下文
            PendingLoadout = null;
            PendingMissionId = null;
            _run.EndRun();
            State = GameState.Base;
            EventBus.Publish(new GameEvents.OnEnterBase());
        }

        public void AbortToBase()
        {
            // 崩溃恢复用：强制回基地安全节点（C2 Blocker）
            State = GameState.Base;
            Mission = MissionState.None;
            EventBus.Publish(new GameEvents.OnEnterBase());
        }

        private void AssertState(GameState expected)
        {
            if (State != expected)
                Debug.LogWarning($"[GameFlow] Expected {expected} but was {State}. Transition may be invalid.");
        }
    }
}
