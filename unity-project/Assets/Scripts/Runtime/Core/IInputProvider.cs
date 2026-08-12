using UnityEngine;

namespace AirspaceEvacuation.Core
{
    /// <summary>
    /// 输入快照接口（ADR-005）。
    /// 仿真/状态机只读此接口，不直连 Input System → 可注入 FakeInputProvider 做自动化测试。
    /// 每帧由表现层（UnityInputProvider）写入快照。
    /// </summary>
    public interface IInputProvider
    {
        /// <summary>归一化移动向量（-1..1）。</summary>
        Vector2 Move { get; }

        /// <summary>瞄准方向（世界坐标，归一化）。</summary>
        Vector2 Aim { get; }

        /// <summary>主火力是否按住。</summary>
        bool FireHeld { get; }

        /// <summary>本帧是否按下闪避（边缘触发）。</summary>
        bool DashPressed { get; }

        /// <summary>本帧是否按下交互（搜刮/撤离）。</summary>
        bool InteractPressed { get; }

        /// <summary>本帧是否按下合成。</summary>
        bool MergePressed { get; }

        /// <summary>本帧是否按下地图/小地图。</summary>
        bool MapToggled { get; }

        /// <summary>本帧是否按下暂停。</summary>
        bool PausePressed { get; }

        /// <summary>清空本帧的边缘触发位（在仿真步消费后调用）。</summary>
        void ConsumeEdgeTriggers();
    }

    /// <summary>
    /// 可变输入快照，供 UnityInputProvider / FakeInputProvider 共用。
    /// </summary>
    [System.Serializable]
    public struct InputSnapshot
    {
        public Vector2 Move;
        public Vector2 Aim;
        public bool FireHeld;
        public bool DashPressed;
        public bool InteractPressed;
        public bool MergePressed;
        public bool MapToggled;
        public bool PausePressed;
    }
}
