namespace AirspaceEvacuation.Core
{
    /// <summary>
    /// 事件定义（对应 framework-scaffold.md §3.1 钩子表 + OnRunFailed）。
    /// 全部 struct，零 GC。
    /// </summary>
    public static class GameEvents
    {
        // —— 基地 / 选机 / 选装 ——
        public struct OnEnterBase : EventBus.IEvent { }
        public struct OnAircraftLocked : EventBus.IEvent { public string AircraftId; }
        public struct OnLoadoutConfirmed : EventBus.IEvent
        {
            public LoadoutEntry[] Loadout; // 已含 state=AT_RISK
        }
        public struct OnMapSelected : EventBus.IEvent { public uint Seed; public int RiskTier; }

        // —— 进图 / 局内 ——
        public struct OnMissionStart : EventBus.IEvent { public string MissionId; public uint Seed; }
        public struct OnPickup : EventBus.IEvent { public string ItemId; public int LootSlot; public int Rarity; }
        public struct OnCombatTick : EventBus.IEvent { public int BulletCount; public int EnemyCount; }
        public struct OnBuffApplied : EventBus.IEvent { public string BuffId; public int Rarity; }
        public struct OnMergeCompleted : EventBus.IEvent { public string ResultItemId; public bool RecipeValid; }

        // —— 撤离 / 结算 ——
        public struct OnExfilTriggered : EventBus.IEvent { public string ExfilPointId; }
        public struct OnExfilResult : EventBus.IEvent
        {
            public ExfilResult Result; // SUCCESS / DEATH / TIMEOUT / ABANDON
        }
        public struct OnMetaSettled : EventBus.IEvent
        {
            public MetaDelta Delta; // 货币Δ/解锁Δ/损失比例
        }
        public struct OnSaveWritten : EventBus.IEvent { public string File; public int SchemaVersion; }
        public struct OnRunFailed : EventBus.IEvent { public ExfilResult Reason; }
    }

    /// <summary>撤离/结算结果枚举。core-loop.md §2 Exfil.result 扩展弃局。</summary>
    public enum ExfilResult
    {
        Success,    // 成功撤离 → 100%
        Death,      // 阵亡 → 损失 85%
        Timeout,    // 超时未撤离 → 损失 85%
        Abandon,    // 主动弃局 → 损失 70%
    }

    /// <summary>带入装备条目（core-loop.md §2 LoadoutItem）。</summary>
    [System.Serializable]
    public struct LoadoutEntry
    {
        public string ItemId;
        public LoadoutItemState State;
    }

    public enum LoadoutItemState
    {
        Idle,       // 库存可用
        AtRisk,     // 进图锁定为在险
        Lost,       // 失败损失
        Returned,   // 成功带回
    }

    /// <summary>结算元进度增量（framework-scaffold §3.1 OnMetaSettled 载荷）。</summary>
    [System.Serializable]
    public struct MetaDelta
    {
        public int CurrencyDelta;       // 灵玉 Δ
        public int ReputationDelta;     // 声望 Δ
        public float LossRatio;         // 应用的损失比例（0/0.85/0.70）
        public int ItemsReturned;       // 带回件数
        public int ItemsLost;           // 损失件数
        public bool Settled;            // 幂等标记
    }
}
