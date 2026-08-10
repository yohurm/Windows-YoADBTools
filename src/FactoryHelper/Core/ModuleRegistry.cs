namespace FactoryHelper.Core;

/// <summary>
/// 模块注册表 — 启动时登记模块，Shell 导航自动生成。
/// </summary>
public class ModuleRegistry
{
    private readonly List<IModule> _modules = [];

    /// <summary>已注册模块（按注册顺序）</summary>
    public IReadOnlyList<IModule> Modules => _modules;

    /// <summary>注册模块（重复注册忽略）</summary>
    public void Register(IModule module)
    {
        if (_modules.Any(m => m.Id == module.Id))
            return;
        _modules.Add(module);
    }

    /// <summary>按 Id 查找模块</summary>
    public IModule? Find(string id) => _modules.FirstOrDefault(m => m.Id == id);
}