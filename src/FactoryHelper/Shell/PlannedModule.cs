namespace FactoryHelper.Shell;

/// <summary>
/// 预留模块声明 — Shell 导航层展示"开发中"入口。
/// 不注册进 ModuleRegistry（不占用模块 Id，未来真实模块注册时无冲突，
/// 同 Id 的真实模块注册后导航自动被真实项替换）。
/// </summary>
public sealed record PlannedModule(string Id, string Title, string IconGlyph);
