using UnityEngine;
using AirspaceEvacuation.Core;
using AirspaceEvacuation.Meta;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 撤离点（extraction.md / E6.1）。
    /// 读条 2-4s 可被打断 + 保底窗口（extraction.md §7）。
    /// 触发 OnExfilTriggered；读条完成 → GameFlow.ResolveRun(Success)。
    /// </summary>
    [RequireComponent(typeof(Collider2D))]
    public class ExtractionZone : MonoBehaviour
    {
        [SerializeField] private float channelDuration = 3f;        // 2-4s 区间
        [SerializeField] private float guaranteeWindowDelay = 600f; // 局末段开放保底（秒，P0 占位）
        [SerializeField] private SpriteRenderer zoneRenderer;

        public bool IsPlayerInside { get; private set; }
        public float ChannelProgress { get; private set; }
        public bool GuaranteeOpen { get; private set; }

        private float _runTimer;
        private bool _resolved;

        private void Awake()
        {
            EnsurePlaceholderVisual();
        }

        private void Update()
        {
            _runTimer += Time.deltaTime;
            if (_runTimer >= guaranteeWindowDelay) GuaranteeOpen = true;

            if (!IsPlayerInside || _resolved) { ChannelProgress = 0f; return; }

            // 读条需玩家按住 Interact（extraction.md §3）
            IInputProvider input = ServiceLocator.Get<IInputProvider>();
            if (input != null && input.InteractPressed)
            {
                input.ConsumeEdgeTriggers();
            }

            // 简化：在区内即读条（P0）；正式需按住 Interact
            ChannelProgress += Time.deltaTime / channelDuration;
            if (ChannelProgress >= 1f)
            {
                CompleteExfil();
            }
        }

        private void OnTriggerEnter2D(Collider2D other)
        {
            if (other.GetComponentInParent<PlayerAircraft>() != null)
            {
                IsPlayerInside = true;
                if (ServiceLocator.TryGet(out GameFlow flow) && flow.Mission != MissionState.Exfil)
                    flow.TriggerExfil("exfil_main");
            }
        }

        private void OnTriggerExit2D(Collider2D other)
        {
            if (other.GetComponentInParent<PlayerAircraft>() != null)
            {
                IsPlayerInside = false;
                ChannelProgress = 0f;
                // 读条被打断（extraction.md §7）
                if (ServiceLocator.TryGet(out RunState run))
                    run.ExfilInterrupted = true;
            }
        }

        /// <summary>读条被打断（被击中/离开）。</summary>
        public void InterruptChannel()
        {
            ChannelProgress = 0f;
            if (ServiceLocator.TryGet(out RunState run))
                run.ExfilInterrupted = true;
        }

        private void CompleteExfil()
        {
            if (_resolved) return;
            _resolved = true; // 一次撤离只结算一次（E7 Blocker）
            ChannelProgress = 1f;
            if (ServiceLocator.TryGet(out GameFlow flow))
            {
                flow.ResolveRun(ExfilResult.Success);
            }
        }

        private void EnsurePlaceholderVisual()
        {
            if (zoneRenderer == null)
            {
                var go = new GameObject("ExfilZoneVisual");
                go.transform.SetParent(transform, false);
                zoneRenderer = go.AddComponent<SpriteRenderer>();
                zoneRenderer.color = new Color(0.2f, 1f, 0.4f, 0.4f);
                zoneRenderer.transform.localScale = new Vector3(3f, 3f, 1f);
            }
        }
    }
}
