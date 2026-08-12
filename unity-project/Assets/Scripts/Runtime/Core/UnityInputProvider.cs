using UnityEngine;
using UnityEngine.InputSystem;

namespace AirspaceEvacuation.Core
{
    /// <summary>
    /// Unity 新 Input System 适配器（ADR-005）。
    /// 表现层 MonoBehaviour，每帧读 InputSystem.Action 写入 InputSnapshot。
    /// 仿真/状态机只读 IInputProvider 接口 → 测试可注入 FakeInputProvider。
    ///
    /// TODO: 接入 .inputactions 资产与 Rebinding UI（Story ADR-005）。
    /// 当前先用 Keyboard/Mouse 直接轮询，保证骨架可编译可跑。
    /// </summary>
    public class UnityInputProvider : MonoBehaviour, IInputProvider
    {
        [SerializeField] private float aimDeadzone = 0.1f;

        private InputSnapshot _snap;
        private Camera _mainCam;

        public Vector2 Move => _snap.Move;
        public Vector2 Aim => _snap.Aim;
        public bool FireHeld => _snap.FireHeld;
        public bool DashPressed => _snap.DashPressed;
        public bool InteractPressed => _snap.InteractPressed;
        public bool MergePressed => _snap.MergePressed;
        public bool MapToggled => _snap.MapToggled;
        public bool PausePressed => _snap.PausePressed;

        private void Awake()
        {
            _mainCam = Camera.main;
        }

        private void Update()
        {
            var kb = Keyboard.current;
            var mouse = Mouse.current;
            if (kb == null) return;

            // Move: WASD / 方向键
            Vector2 move = Vector2.zero;
            if (kb.wKey.isPressed || kb.upArrowKey.isPressed) move.y += 1f;
            if (kb.sKey.isPressed || kb.downArrowKey.isPressed) move.y -= 1f;
            if (kb.aKey.isPressed || kb.leftArrowKey.isPressed) move.x -= 1f;
            if (kb.dKey.isPressed || kb.rightArrowKey.isPressed) move.x += 1f;
            _snap.Move = move.sqrMagnitude > 1f ? move.normalized : move;

            // Aim: 鼠标位置 → 世界方向
            if (mouse != null)
            {
                Vector3 screenPos = mouse.position.ReadValue();
                Vector3 worldPos = _mainCam != null ? _mainCam.ScreenToWorldPoint(screenPos) : Vector3.zero;
                Vector2 aim = (Vector2)(worldPos - transform.position);
                if (aim.sqrMagnitude > aimDeadzone * aimDeadzone)
                    _snap.Aim = aim.normalized;
                else
                    _snap.Aim = Vector2.zero;

                _snap.FireHeld = mouse.leftButton.isPressed;
            }
            else
            {
                _snap.Aim = Vector2.zero;
                _snap.FireHeld = false;
            }

            // 边缘触发
            _snap.DashPressed |= kb.leftShiftKey.wasPressedThisFrame || kb.spaceKey.wasPressedThisFrame;
            _snap.InteractPressed |= kb.eKey.wasPressedThisFrame;
            _snap.MergePressed |= kb.fKey.wasPressedThisFrame;
            _snap.MapToggled |= kb.tabKey.wasPressedThisFrame || kb.mKey.wasPressedThisFrame;
            _snap.PausePressed |= kb.escapeKey.wasPressedThisFrame;
        }

        public void ConsumeEdgeTriggers()
        {
            _snap.DashPressed = false;
            _snap.InteractPressed = false;
            _snap.MergePressed = false;
            _snap.MapToggled = false;
            _snap.PausePressed = false;
        }
    }
}
