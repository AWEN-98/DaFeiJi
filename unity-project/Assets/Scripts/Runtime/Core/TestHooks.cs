using UnityEngine;
using AirspaceEvacuation.Meta;

namespace AirspaceEvacuation.Core
{
    /// <summary>
    /// 测试辅助 API（framework-scaffold.md §3.3）。
    /// 供 QA 烟雾测试脚本直接调用，跳过手动选单 / 注入输入 / 强制结算 / 模拟崩溃。
    /// 必须在 Bootstrap 场景挂载 GameObject 并注入 GameFlow/MetaState/RunState。
    /// </summary>
    public class TestHooks : MonoBehaviour
    {
        public static TestHooks Instance { get; private set; }

        [SerializeField] private GameFlowBootstrap bootstrap;

        private void Awake()
        {
            Instance = this;
        }

        /// <summary>直接进图，跳过手动选单（framework-scaffold §3.3）。</summary>
        public void StartMission(uint seed, int riskTier, string aircraftId = "qingzhui")
        {
            var flow = bootstrap.GameFlow;
            if (flow.State == GameState.Boot) flow.CompleteBoot();
            if (flow.State == GameState.Base) flow.ConfirmAircraft(aircraftId);
            if (flow.State == GameState.Loadout)
            {
                var loadout = new LoadoutEntry[]
                {
                    new LoadoutEntry { ItemId = "wpn_basic_cannon", State = LoadoutItemState.Idle },
                };
                flow.ConfirmLoadout(loadout);
            }
            if (flow.State == GameState.SelectMap) flow.ConfirmMap(seed, riskTier);
        }

        /// <summary>注入按键序列（ADR-005 FakeInputProvider）。</summary>
        public void InjectInput(FakeInputProvider fake)
        {
            bootstrap.SetInputProvider(fake);
        }

        /// <summary>强制结算分支（framework-scaffold §3.3）。</summary>
        public void ForceExfil(ExfilResult result)
        {
            var flow = bootstrap.GameFlow;
            if (flow.State != GameState.Mission) return;
            if (result == ExfilResult.Success)
                flow.TriggerExfil("exfil_test");
            flow.ResolveRun(result);
            var delta = bootstrap.RunResultResolver.Resolve(result, bootstrap.Meta, bootstrap.Run);
            flow.FinishResultAndReturnToBase(delta);
        }

        /// <summary>读 MetaState 快照（framework-scaffold §3.3）。</summary>
        public MetaState GetMetaSnapshot()
        {
            return bootstrap.Meta;
        }

        /// <summary>模拟强杀→重进，验 C2/X4（framework-scaffold §3.3）。</summary>
        public void CrashAndResume()
        {
            // 强制写盘 run.save（若有），然后回退到 Base 安全节点
            bootstrap.SaveSystem.SaveRun(bootstrap.Run);
            bootstrap.GameFlow.AbortToBase();
        }
    }
}
