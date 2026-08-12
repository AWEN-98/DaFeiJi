namespace AirspaceEvacuation.Core
{
    /// <summary>
    /// 确定性随机数接口（ADR-002 §确定性约定）。
    /// 种子来自 run.save；同种子同参数 = 同局（QA P5 复现 Bug）。
    /// </summary>
    public interface IRng
    {
        uint State { get; }
        void Seed(uint seed);
        uint NextUInt();
        int NextInt(int minInclusive, int maxExclusive);
        float NextFloat01();
        /// <summary>按权重抽取索引（weights 长度即候选数，返回 0..n-1）。</summary>
        int WeightedIndex(float[] weights);
    }

    /// <summary>
    /// PCG32 变体（xoshiro128** 风格），纯 C# 无 Unity 依赖。
    /// 满足确定性：同种子同序列。
    /// </summary>
    public sealed class PcgRng : IRng
    {
        private ulong _state;
        private const ulong Mul = 6364136223846793005UL;
        private const ulong Inc = 1442695040888963407UL | 1UL;

        public uint State => (uint)(_state >> 32);

        public PcgRng(uint seed = 0x9E3779B9u)
        {
            Seed(seed);
        }

        public void Seed(uint seed)
        {
            _state = (seed + Inc) * Mul + Inc;
            for (int i = 0; i < 4; i++) NextUInt();
        }

        public uint NextUInt()
        {
            ulong oldstate = _state;
            _state = oldstate * Mul + Inc;
            ulong xorshifted = ((oldstate >> 18) ^ oldstate) >> 27;
            uint rot = (uint)(oldstate >> 59);
            return (uint)((xorshifted >> rot) | (xorshifted << ((int)(-rot & 31))));
        }

        public int NextInt(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive) return minInclusive;
            uint range = (uint)(maxExclusive - minInclusive);
            return minInclusive + (int)(NextUInt() % range);
        }

        public float NextFloat01()
        {
            // 24 位精度
            return (NextUInt() >> 8) * (1f / 16777216f);
        }

        public int WeightedIndex(float[] weights)
        {
            if (weights == null || weights.Length == 0) return 0;
            float sum = 0f;
            for (int i = 0; i < weights.Length; i++) sum += Mathf_max(weights[i], 0f);
            if (sum <= 0f) return 0;
            float r = NextFloat01() * sum;
            float acc = 0f;
            for (int i = 0; i < weights.Length; i++)
            {
                acc += Mathf_max(weights[i], 0f);
                if (r <= acc) return i;
            }
            return weights.Length - 1;
        }

        private static float Mathf_max(float a, float b) => a > b ? a : b;
    }
}
