using UnityEngine;
using AirspaceEvacuation.Core;
using AirspaceEvacuation.Meta;
using AirspaceEvacuation.Save;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 工程入口粘合层（ADR-002 Presentation 层）。
    /// 负责构建 MetaState / RunState / SaveSystem / GameFlow / IInputProvider 并注册到 ServiceLocator。
    /// 挂载在 Bootstrap 场景的根 GameObject 上。
    /// </summary>
    public class GameFlowBootstrap : MonoBehaviour
    {
        [Header("配置资产")]
        [SerializeField] private Meta.Config.AircraftConfig defaultAircraft;
        [SerializeField] private Meta.Config.RunePoolConfig runePool;
        [SerializeField] private Meta.Config.MergeRecipeConfig mergeRecipes;

        [Header("场景引用")]
        [SerializeField] private UnityInputProvider unityInput;
        [SerializeField] private PlayerAircraft player;
        [SerializeField] private EnemySpawner enemySpawner;
        [SerializeField] private ExtractionZone extractionZone;
        [SerializeField] private UI.HUDBootstrap hud;
        [SerializeField] private AudioStub.AudioEventStub audioStub;

        // 运行时单例引用（供 TestHooks 访问）
        public MetaState Meta { get; private set; }
        public RunState Run { get; private set; }
        public SaveSystem SaveSystem { get; private set; }
        public GameFlow GameFlow { get; private set; }
        public RunResultResolver RunResultResolver { get; private set; }
        public IInputProvider InputProvider { get; private set; }

        private void Awake()
        {
            Meta = new MetaState();
            Run = new RunState();
            SaveSystem = new SaveSystem();
            // 尝试加载存档；失败用新档（ADR-003 §迁移与回滚流程）
            MetaState loaded = SaveSystem.LoadMeta();
            if (loaded != null) Meta = loaded;

            GameFlow = new GameFlow(Meta, Run);
            RunResultResolver = new RunResultResolver();

            // 默认用 UnityInputProvider；测试可由 TestHooks.InjectInput 替换为 Fake
            InputProvider = unityInput;

            // 注册到 ServiceLocator（供非 [SerializeField] 链路使用）
            ServiceLocator.Register(Meta);
            ServiceLocator.Register(Run);
            ServiceLocator.Register(SaveSystem);
            ServiceLocator.Register(GameFlow);
            ServiceLocator.Register(InputProvider);
            ServiceLocator.Register<Meta.Config.AircraftConfig>(defaultAircraft);
            ServiceLocator.Register<Meta.Config.RunePoolConfig>(runePool);
            ServiceLocator.Register<Meta.Config.MergeRecipeConfig>(mergeRecipes);

            // 启动状态机
            GameFlow.CompleteBoot(); // Boot → Base → OnEnterBase
        }

        private void Start()
        {
            // 进图演示：直接进一局（P0 骨架；正式流程由 UI 触发选单）
            // 留作手动触发；此处不自动进图，等场景交互或 TestHooks.StartMission
        }

        private void OnApplicationQuit()
        {
            // 退出前写盘
            SaveSystem.SaveMeta(Meta);
            if (Run.Active) SaveSystem.SaveRun(Run);
        }

        /// <summary>切换输入提供者（测试注入用）。</summary>
        public void SetInputProvider(IInputProvider provider)
        {
            InputProvider = provider;
            ServiceLocator.Unregister<IInputProvider>();
            ServiceLocator.Register(provider);
            if (player != null) player.SetInputProvider(provider);
        }
    }
}
