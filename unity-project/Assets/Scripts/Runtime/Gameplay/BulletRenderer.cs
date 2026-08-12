using UnityEngine;

namespace AirspaceEvacuation.Gameplay
{
    /// <summary>
    /// 弹幕渲染器（ADR-002 Presentation 层）。
    /// 单 MonoBehaviour 读 BulletPool 的活跃位置，用 Graphics.DrawMeshInstanced 一次性合批渲染。
    /// 不持有任何游戏逻辑；逻辑在 BulletPool / PlayerAircraft / Enemy。
    /// 美术占位：运行时生成纯色 Quad Mesh + Material（区分敌我弹颜色）。
    /// </summary>
    public class BulletRenderer : MonoBehaviour
    {
        [SerializeField] private float bulletScale = 0.24f;
        [SerializeField] private Color playerBulletColor = new Color(0.4f, 0.9f, 1f);
        [SerializeField] private Color enemyBulletColor = new Color(1f, 0.5f, 0.4f);

        private BulletPool _pool;
        private Mesh _quadMesh;
        private Material _playerMat;
        private Material _enemyMat;
        private Matrix4x4[] _matrices;

        // 上限：DrawMeshInstanced 单次 1023
        private const int BatchLimit = 1023;

        public void Init(BulletPool pool)
        {
            _pool = pool;
            _matrices = new Matrix4x4[BatchLimit];
            EnsureAssets();
        }

        private void EnsureAssets()
        {
            if (_quadMesh == null)
            {
                _quadMesh = new Mesh { name = "BulletQuad" };
                _quadMesh.vertices = new Vector3[]
                {
                    new Vector3(-0.5f, -0.5f, 0),
                    new Vector3(0.5f, -0.5f, 0),
                    new Vector3(0.5f, 0.5f, 0),
                    new Vector3(-0.5f, 0.5f, 0),
                };
                _quadMesh.triangles = new int[] { 0, 2, 1, 0, 3, 2 };
                _quadMesh.RecalculateNormals();
            }
            if (_playerMat == null)
            {
                _playerMat = new Material(Shader.Find("Unlit/Color"));
                _playerMat.color = playerBulletColor;
            }
            if (_enemyMat == null)
            {
                _enemyMat = new Material(Shader.Find("Unlit/Color"));
                _enemyMat.color = enemyBulletColor;
            }
        }

        private void Update()
        {
            if (_pool == null) return;
            EnsureAssets();

            // 玩家弹与敌弹分别合批（同材质才能合批）
            DrawFaction(Entity.Faction.Player, _playerMat);
            DrawFaction(Entity.Faction.Enemy, _enemyMat);
        }

        private void DrawFaction(Entity.Faction faction, Material mat)
        {
            int count = 0;
            // 简化：复用 CopyActivePositions 再按 faction 过滤
            // 性能考量：每帧遍历池是 O(capacity)，3000 可接受；演进可改 SoA 分阵营数组
            int cap = _pool.Capacity;
            for (int i = 0; i < cap && count < BatchLimit; i++)
            {
                if (!_pool.IsActiveIndex(i)) continue;
                if (_pool.GetFaction(i) != faction) continue;
                Vector2 p = _pool.GetPosition(i);
                _matrices[count++] = Matrix4x4.TRS(
                    new Vector3(p.x, p.y, 0f),
                    Quaternion.identity,
                    new Vector3(bulletScale, bulletScale, 1f));
            }
            if (count > 0)
            {
                Graphics.DrawMeshInstanced(_quadMesh, 0, mat, _matrices, count,
                    null, UnityEngine.Rendering.ShadowCastingMode.Off, false, 0);
            }
        }
    }
}
