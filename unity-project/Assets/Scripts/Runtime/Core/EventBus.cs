using System;
using System.Collections.Generic;

namespace AirspaceEvacuation.Core
{
    /// <summary>
    /// 轻量泛型事件总线（ADR-002 横切模块）。
    /// 所有事件必须是 struct 并实现 IEvent，避免 GC 分配。
    /// 对应 framework-scaffold.md §3.1 的 13 个钩子 + OnRunFailed。
    /// </summary>
    public static class EventBus
    {
        public interface IEvent { }

        private static readonly Dictionary<Type, List<Delegate>> _subscribers = new Dictionary<Type, List<Delegate>>();

        public static void Subscribe<T>(Action<T> handler) where T : struct, IEvent
        {
            if (handler == null) return;
            Type t = typeof(T);
            if (!_subscribers.TryGetValue(t, out List<Delegate> list))
            {
                list = new List<Delegate>();
                _subscribers[t] = list;
            }
            list.Add(handler);
        }

        public static void Unsubscribe<T>(Action<T> handler) where T : struct, IEvent
        {
            if (handler == null) return;
            Type t = typeof(T);
            if (_subscribers.TryGetValue(t, out List<Delegate> list))
            {
                list.Remove(handler);
                if (list.Count == 0) _subscribers.Remove(t);
            }
        }

        public static void Publish<T>(T evt) where T : struct, IEvent
        {
            Type t = typeof(T);
            if (!_subscribers.TryGetValue(t, out List<Delegate> list)) return;
            // 拷贝一份避免订阅中修改集合
            for (int i = 0; i < list.Count; i++)
            {
                ((Action<T>)list[i]).Invoke(evt);
            }
        }

        public static void Clear()
        {
            _subscribers.Clear();
        }

        public static int SubscriberCount<T>() where T : struct, IEvent
        {
            return _subscribers.TryGetValue(typeof(T), out List<Delegate> list) ? list.Count : 0;
        }
    }
}
