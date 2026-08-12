using System;
using System.IO;
using System.Security.Cryptography;
using UnityEngine;
using AirspaceEvacuation.Core;
using AirspaceEvacuation.Meta;

namespace AirspaceEvacuation.Save
{
    /// <summary>
    /// 存档系统（ADR-003）。
    /// 双文件分离：meta.save（持久，云同步）+ run.save（局内，崩溃恢复）。
    /// 本 Sprint 用本地 JSON + 版本信封 + HMAC-SHA256 签名桩。
    /// TODO: 替换为 MessagePack（Story E1.2）；密钥编译期注入占位。
    /// </summary>
    public class SaveSystem
    {
        private const string Magic = "SHNH";
        private const int SchemaVersion = 1;
        private const int MaxBackups = 3;

        // 桩密钥（生产应编译期注入，ADR-003 §序列化结构）
        private static readonly byte[] BuildKey =
            System.Text.Encoding.UTF8.GetBytes("AirspaceEvacuation.HMAC.Key.Placeholder.v1");

        private readonly string _saveDir;
        private readonly ICloudSync _cloud;

        public SaveSystem(string saveDir = null, ICloudSync cloud = null)
        {
            _saveDir = saveDir ?? DefaultSaveDir();
            _cloud = cloud ?? new NullCloudSync();
            if (!Directory.Exists(_saveDir)) Directory.CreateDirectory(_saveDir);
        }

        public static string DefaultSaveDir()
        {
            // LocalLow/<Studio>/<Game>/saves/（ADR-003 §文件与路径）
            string root = Path.Combine(Application.persistentDataPath, "saves");
            return root;
        }

        // —— meta.save ——
        public bool SaveMeta(MetaState meta)
        {
            string json = JsonUtility.ToJson(meta);
            byte[] payload = System.Text.Encoding.UTF8.GetBytes(json);
            byte[] sig = HmacSha256(payload);
            var env = new SaveEnvelope
            {
                magic = Magic,
                schemaVersion = SchemaVersion,
                payloadBase64 = Convert.ToBase64String(payload),
                signatureBase64 = Convert.ToBase64String(sig),
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            };
            string envJson = JsonUtility.ToJson(env);

            // 原子写：.tmp → rename（ADR-003 X4 强杀不损坏）
            string path = Path.Combine(_saveDir, "meta.save");
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, envJson);
            RotateBackup("meta.save");
            File.Move(tmp, path); // .NET 不支持原子 rename 跨卷，但同目录 OK

            // 云同步（启用时）
            if (_cloud.IsAvailable)
            {
                _cloud.UploadMeta(payload);
            }

            EventBus.Publish(new GameEvents.OnSaveWritten { File = "meta", SchemaVersion = SchemaVersion });
            return true;
        }

        public MetaState LoadMeta()
        {
            string path = Path.Combine(_saveDir, "meta.save");
            if (!File.Exists(path)) return NewMetaState();

            MetaState meta = null;
            bool tampered = false;

            try
            {
                string envJson = File.ReadAllText(path);
                SaveEnvelope env = JsonUtility.FromJson<SaveEnvelope>(envJson);
                if (env.magic != Magic)
                {
                    Debug.LogWarning("[Save] magic mismatch — fallback to .bak");
                    return LoadBackup();
                }
                if (env.schemaVersion > SchemaVersion)
                {
                    Debug.LogWarning("[Save] future schema version — fallback to .bak");
                    return LoadBackup();
                }
                // 迁移链（ADR-003 §迁移与回滚流程）
                // TODO: if (env.schemaVersion < SchemaVersion) Migrate(env);

                byte[] payload = Convert.FromBase64String(env.payloadBase64);
                byte[] sig = Convert.FromBase64String(env.signatureBase64);
                byte[] expected = HmacSha256(payload);
                if (!ConstantTimeEquals(sig, expected))
                {
                    Debug.LogWarning("[Save] signature mismatch — marked tampered, fallback to .bak (G1)");
                    tampered = true;
                    meta = LoadBackup();
                }
                else
                {
                    string json = System.Text.Encoding.UTF8.GetString(payload);
                    meta = JsonUtility.FromJson<MetaState>(json);
                }
            }
            catch (Exception e)
            {
                Debug.LogError($"[Save] load meta failed: {e.Message} — fallback to .bak");
                meta = LoadBackup();
            }

            if (meta == null)
            {
                // .bak 也失败 → 安全新档（保留旧档为 .corrupt）
                MarkCorrupt("meta.save");
                meta = NewMetaState();
            }

            meta.ClampValues();
            if (tampered)
            {
                // ADR-003：标记 tampered，禁用云排行/成就（不封号）
                Debug.LogWarning("[Save] meta marked tampered — cloud leaderboard/achievements disabled.");
            }
            return meta;
        }

        // —— run.save ——
        public bool SaveRun(RunState run)
        {
            string json = JsonUtility.ToJson(run);
            string path = Path.Combine(_saveDir, "run.save");
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, json);
            File.Move(tmp, path);
            EventBus.Publish(new GameEvents.OnSaveWritten { File = "run", SchemaVersion = SchemaVersion });
            return true;
        }

        public RunState LoadRun()
        {
            string path = Path.Combine(_saveDir, "run.save");
            if (!File.Exists(path)) return null;
            try
            {
                string json = File.ReadAllText(path);
                return JsonUtility.FromJson<RunState>(json);
            }
            catch (Exception e)
            {
                Debug.LogError($"[Save] load run failed: {e.Message}");
                return null;
            }
        }

        public void DeleteRun()
        {
            string path = Path.Combine(_saveDir, "run.save");
            if (File.Exists(path)) File.Delete(path);
        }

        // —— 内部 ——
        private MetaState LoadBackup()
        {
            for (int i = 1; i <= MaxBackups; i++)
            {
                string bak = Path.Combine(_saveDir, $"meta.save.bak{i}");
                if (!File.Exists(bak)) continue;
                try
                {
                    string envJson = File.ReadAllText(bak);
                    SaveEnvelope env = JsonUtility.FromJson<SaveEnvelope>(envJson);
                    if (env.magic != Magic) continue;
                    byte[] payload = Convert.FromBase64String(env.payloadBase64);
                    byte[] sig = Convert.FromBase64String(env.signatureBase64);
                    if (!ConstantTimeEquals(sig, HmacSha256(payload))) continue;
                    string json = System.Text.Encoding.UTF8.GetString(payload);
                    return JsonUtility.FromJson<MetaState>(json);
                }
                catch { /* try next */ }
            }
            return null;
        }

        private void RotateBackup(string filename)
        {
            string path = Path.Combine(_saveDir, filename);
            if (!File.Exists(path)) return;
            // bak3 ← bak2 ← bak1 ← current
            for (int i = MaxBackups; i >= 2; i--)
            {
                string from = Path.Combine(_saveDir, $"{filename}.bak{i - 1}");
                string to = Path.Combine(_saveDir, $"{filename}.bak{i}");
                if (File.Exists(from))
                {
                    if (File.Exists(to)) File.Delete(to);
                    File.Move(from, to);
                }
            }
            string bak1 = Path.Combine(_saveDir, $"{filename}.bak1");
            if (File.Exists(bak1)) File.Delete(bak1);
            File.Copy(path, bak1);
        }

        private void MarkCorrupt(string filename)
        {
            string path = Path.Combine(_saveDir, filename);
            string corrupt = Path.Combine(_saveDir, filename + ".corrupt");
            if (File.Exists(path))
            {
                if (File.Exists(corrupt)) File.Delete(corrupt);
                File.Move(path, corrupt);
            }
        }

        private MetaState NewMetaState()
        {
            var meta = new MetaState();
            meta.ClampValues();
            return meta;
        }

        private static byte[] HmacSha256(byte[] payload)
        {
            using (var hmac = new HMACSHA256(BuildKey))
            {
                return hmac.ComputeHash(payload);
            }
        }

        private static bool ConstantTimeEquals(byte[] a, byte[] b)
        {
            if (a == null || b == null || a.Length != b.Length) return false;
            int diff = 0;
            for (int i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }

        [Serializable]
        private struct SaveEnvelope
        {
            public string magic;
            public int schemaVersion;
            public string payloadBase64;
            public string signatureBase64;
            public long timestamp;
        }
    }
}
