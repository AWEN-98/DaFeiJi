using UnityEngine;
using AirspaceEvacuation.Core;

namespace AirspaceEvacuation.AudioStub
{
    /// <summary>
    /// 音频事件桩（main-architecture §5 Audio / sound-plan）。
    /// 仅通过 EventBus 订阅，不反向依赖仿真（ADR-002 §5）。
    /// 留 Wwise/Unity Audio 接口；P0 用 Debug.Log 占位。
    /// TODO: 接 Wwise 或 Unity Audio（音频角色交付 sound-plan 后）。
    /// </summary>
    public class AudioEventStub : MonoBehaviour
    {
        // 事件 ID 常量（对齐 audio/sound-plan.md，待音频角色补全）
        public const string SfxFire = "sfx_fire";
        public const string SfxHit = "sfx_hit";
        public const string SfxEnemyDeath = "sfx_enemy_death";
        public const string SfxPlayerDeath = "sfx_player_death";
        public const string SfxDash = "sfx_dash";
        public const string SfxPickup = "sfx_pickup";
        public const string SfxMerge = "sfx_merge";
        public const string SfxBuff = "sfx_buff";
        public const string SfxExfilTrigger = "sfx_exfil_trigger";
        public const string SfxExfilComplete = "sfx_exfil_complete";
        public const string BgmBase = "bgm_base";
        public const string BgmCombat = "bgm_combat";
        public const string BgmBoss = "bgm_boss";

        private void OnEnable()
        {
            EventBus.Subscribe<GameEvents.OnPickup>(OnPickup);
            EventBus.Subscribe<GameEvents.OnBuffApplied>(OnBuffApplied);
            EventBus.Subscribe<GameEvents.OnMergeCompleted>(OnMergeCompleted);
            EventBus.Subscribe<GameEvents.OnExfilTriggered>(OnExfilTriggered);
            EventBus.Subscribe<GameEvents.OnExfilResult>(OnExfilResult);
            EventBus.Subscribe<GameEvents.OnMissionStart>(OnMissionStart);
        }

        private void OnDisable()
        {
            EventBus.Unsubscribe<GameEvents.OnPickup>(OnPickup);
            EventBus.Unsubscribe<GameEvents.OnBuffApplied>(OnBuffApplied);
            EventBus.Unsubscribe<GameEvents.OnMergeCompleted>(OnMergeCompleted);
            EventBus.Unsubscribe<GameEvents.OnExfilTriggered>(OnExfilTriggered);
            EventBus.Unsubscribe<GameEvents.OnExfilResult>(OnExfilResult);
            EventBus.Unsubscribe<GameEvents.OnMissionStart>(OnMissionStart);
        }

        /// <summary>统一播放入口（留接口，P0 仅日志）。</summary>
        public void Play(string eventId, float volume = 1f)
        {
            // TODO: 接 Wwise AkSoundEngine.PostEvent 或 Unity AudioSource.PlayOneShot
            Debug.Log($"[Audio] {eventId} vol={volume:F2}");
        }

        private void OnPickup(GameEvents.OnPickup evt)
        {
            Play(SfxPickup);
        }

        private void OnBuffApplied(GameEvents.OnBuffApplied evt)
        {
            Play(SfxBuff);
        }

        private void OnMergeCompleted(GameEvents.OnMergeCompleted evt)
        {
            Play(SfxMerge);
        }

        private void OnExfilTriggered(GameEvents.OnExfilTriggered evt)
        {
            Play(SfxExfilTrigger);
        }

        private void OnExfilResult(GameEvents.OnExfilResult evt)
        {
            if (evt.Result == ExfilResult.Success)
                Play(SfxExfilComplete);
            else
                Play(SfxPlayerDeath);
        }

        private void OnMissionStart(GameEvents.OnMissionStart evt)
        {
            Play(BgmCombat);
        }
    }
}
