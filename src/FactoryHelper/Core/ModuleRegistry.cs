namespace FactoryHelper.Core;

/// <summary>
/// 模块注册表 — 启动时登记模块，Shell 导航自动生成。
/// 重复 Id 抛异常（fail-fast）：占位模块与真实模块不得共享注册路径。
/// </summary>
public class ModuleRegistry
{
    private readonly List<IModule> _modules = [];

    /// <summary>已注册模块（按注册顺序）</summary>
    public IReadOnlyList<IModule> Modules => _modules;

    /// <summary>注册模块（Id 重复抛异常）</summary>
    public void Register(IModule module)
    {
        if (_modules.Any(m => m.Id == module.Id))
            throw new InvalidOperationException($"模块 Id 重复: {module.Id}，模块 Id 必须唯一");
        _modules.Add(module);
    }

    /// <summary>强制生命周期：全部模块先 Initialize，之后才允许 CreateView</summary>
    public void InitializeAll(IModuleContext context)
    {
        foreach (var module in _modules)
            module.Initialize(context);
    }

    /// <summary>按 Id 查找模块</summary>
    public IModule? Find(string id) => _modules.FirstOrDefault(m => m.Id == id);
}
