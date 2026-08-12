namespace AirspaceEvacuation.Save
{
    /// <summary>
    /// 云存档同步接口（ADR-003）。
    /// 预留 Steam Cloud 实现；本 Sprint 用本地桩，不引入 Steamworks 依赖。
    /// Q5 未决：Steam 云存档是否首发启用。
    /// </summary>
    public interface ICloudSync
    {
        bool IsAvailable { get; }

        /// <summary>上传 meta.save 到云。返回是否成功。</summary>
        bool UploadMeta(byte[] payload);

        /// <summary>下载云端 meta.save。返回 null 表示无云端数据。</summary>
        byte[] DownloadMeta();

        /// <summary>解决冲突：本地 vs 云端 timestamp。返回应保留的一方。</summary>
        CloudConflictResolution ResolveConflict(long localTimestamp, long cloudTimestamp);
    }

    public enum CloudConflictResolution
    {
        KeepLocal,
        KeepCloud,
        Merge, // 留待远期实现
    }

    /// <summary>
    /// 本地桩：云同步不可用，仅保留接口（ADR-003 未决 Q5）。
    /// TODO: 接入 Steamworks SteamRemoteStorage（Story E1.2 / Q5 决策后）。
    /// </summary>
    public sealed class NullCloudSync : ICloudSync
    {
        public bool IsAvailable => false;

        public bool UploadMeta(byte[] payload)
        {
            // 桩：不实际上传
            return false;
        }

        public byte[] DownloadMeta()
        {
            return null;
        }

        public CloudConflictResolution ResolveConflict(long localTimestamp, long cloudTimestamp)
        {
            return CloudConflictResolution.KeepLocal;
        }
    }
}
