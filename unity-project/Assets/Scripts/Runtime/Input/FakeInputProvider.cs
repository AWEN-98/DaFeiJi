using UnityEngine;
using AirspaceEvacuation.Core;

namespace AirspaceEvacuation.Input
{
    /// <summary>
    /// 假输入提供者（ADR-005 / framework-scaffold §3.3）。
    /// 测试中注入合成输入序列（如"按住 Fire 30 帧""按 Merge"）驱动 PlayMode 烟雾测试。
    /// </summary>
    public class FakeInputProvider : IInputProvider
    {
        private InputSnapshot _snap;

        public Vector2 Move => _snap.Move;
        public Vector2 Aim => _snap.Aim;
        public bool FireHeld => _snap.FireHeld;
        public bool DashPressed => _snap.DashPressed;
        public bool InteractPressed => _snap.InteractPressed;
        public bool MergePressed => _snap.MergePressed;
        public bool MapToggled => _snap.MapToggled;
        public bool PausePressed => _snap.PausePressed;

        public void SetMove(Vector2 v) { _snap.Move = v; }
        public void SetAim(Vector2 v) { _snap.Aim = v; }
        public void SetFire(bool held) { _snap.FireHeld = held; }
        public void PressDash() { _snap.DashPressed = true; }
        public void PressInteract() { _snap.InteractPressed = true; }
        public void PressMerge() { _snap.MergePressed = true; }
        public void PressMap() { _snap.MapToggled = true; }
        public void PressPause() { _snap.PausePressed = true; }

        public void ConsumeEdgeTriggers()
        {
            _snap.DashPressed = false;
            _snap.InteractPressed = false;
            _snap.MergePressed = false;
            _snap.MapToggled = false;
            _snap.PausePressed = false;
        }

        /// <summary>一键清空所有输入（测试用）。</summary>
        public void Reset()
        {
            _snap = default;
        }
    }
}
