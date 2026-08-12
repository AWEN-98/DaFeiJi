using UnityEngine;
using UnityEngine.UI;
using AirspaceEvacuation.Core;
using AirspaceEvacuation.Meta;

namespace AirspaceEvacuation.UI
{
    /// <summary>
    /// HUD 启动器（ux-spec 占位 / E3.2）。
    /// 血盾 / 武器冷却 / 闪避冷却 / 小地图占位 / 撤离提示。
    /// 薄表现层：只读 MetaState/RunState/Player，不含游戏规则（ADR-002）。
    /// 美术占位：用 uGUI Text/Image 纯色块。
    /// </summary>
    public class HUDBootstrap : MonoBehaviour
    {
        [SerializeField] private PlayerAircraft player;
        [SerializeField] private ExtractionZone exfilZone;

        private Text _hpText;
        private Text _shieldText;
        private Text _dashCdText;
        private Text _ammoText;
        private Text _exfilText;
        private Text _minimapText;
        private Canvas _canvas;

        private void Awake()
        {
            EnsureCanvas();
        }

        private void EnsureCanvas()
        {
            if (_canvas != null) return;
            var go = new GameObject("HUDCanvas");
            _canvas = go.AddComponent<Canvas>();
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            go.AddComponent<CanvasScaler>();
            go.AddComponent<GraphicRaycaster>();

            _hpText = MakeText("HP", new Vector2(10, -10), new Vector2(200, 40));
            _shieldText = MakeText("Shield", new Vector2(10, -50), new Vector2(200, 40));
            _dashCdText = MakeText("Dash", new Vector2(10, -90), new Vector2(200, 40));
            _ammoText = MakeText("Ammo", new Vector2(10, -130), new Vector2(200, 40));
            _exfilText = MakeText("Exfil", new Vector2(-210, 10), new Vector2(200, 40));
            _exfilText.alignment = TextAnchor.UpperRight;
            _minimapText = MakeText("Map", new Vector2(-210, -50), new Vector2(200, 200));
            _minimapText.alignment = TextAnchor.UpperRight;
            _minimapText.fontSize = 10;
        }

        private Text MakeText(string name, Vector2 anchorMin, Vector2 size)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_canvas.transform, false);
            var rt = go.AddComponent<RectTransform>();
            rt.anchorMin = new Vector2(0, 1);
            rt.anchorMax = new Vector2(0, 1);
            rt.pivot = new Vector2(0, 1);
            rt.anchoredPosition = anchorMin;
            rt.sizeDelta = size;
            var t = go.AddComponent<Text>();
            t.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            t.fontSize = 16;
            t.color = Color.white;
            t.text = name;
            return t;
        }

        private void Update()
        {
            if (player == null)
            {
                if (ServiceLocator.TryGet(out PlayerAircraft p)) player = p;
                if (player == null) return;
            }

            _hpText.text = $"HP: {Mathf.Max(0, player.Hp):F0} / {player.Config?.MaxHp ?? 100:F0}";
            _shieldText.text = $"Shield: {player.Shield:F0}";
            _dashCdText.text = player.IsInvincible ? "Dash: i-frame" : "Dash: ready";
            _ammoText.text = $"Bullets: {ServiceLocator.Get<BulletPool>()?.ActiveCount ?? 0}";

            if (exfilZone != null)
            {
                if (exfilZone.IsPlayerInside)
                    _exfilText.text = $"EXFIL: {exfilZone.ChannelProgress * 100f:F0}%";
                else if (exfilZone.GuaranteeOpen)
                    _exfilText.text = "EXFIL: guarantee window open";
                else
                    _exfilText.text = "EXFIL: reach zone";
            }

            // 小地图占位：显示状态机阶段
            if (ServiceLocator.TryGet(out GameFlow flow))
            {
                _minimapText.text = $"State: {flow.State}\nMission: {flow.Mission}";
            }
        }
    }
}
