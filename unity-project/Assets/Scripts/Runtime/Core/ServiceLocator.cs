using System;
using System.Collections.Generic;

namespace AirspaceEvacuation.Core
{
    /// <summary>
    /// 极简服务定位器（ADR-002 横切模块）。
    /// 保持 lean：仅做接口→实例绑定，不做作用域/生命周期管理。
    /// 用于在无 [SerializeField] 链路时共享 SaveSystem / MetaState / IRng 等单例。
    /// </summary>
    public static class ServiceLocator
    {
        private static readonly Dictionary<Type, object> _services = new Dictionary<Type, object>();

        public static void Register<T>(T instance) where T : class
        {
            if (instance == null) return;
            _services[typeof(T)] = instance;
        }

        public static T Get<T>() where T : class
        {
            return _services.TryGetValue(typeof(T), out object obj) ? obj as T : null;
        }

        public static bool TryGet<T>(out T instance) where T : class
        {
            bool ok = _services.TryGetValue(typeof(T), out object obj);
            instance = ok ? obj as T : null;
            return ok;
        }

        public static void Unregister<T>() where T : class
        {
            _services.Remove(typeof(T));
        }

        public static void Clear()
        {
            _services.Clear();
        }
    }
}
