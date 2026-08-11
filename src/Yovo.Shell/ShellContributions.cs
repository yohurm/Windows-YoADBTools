using Microsoft.Extensions.DependencyInjection;
using Yovo.Platform.Abstractions.Composition;
using Yovo.Shell.ViewModels;
using Yovo.Shell.Views;

namespace Yovo.Shell;

/// <summary>
/// Shell 自身的贡献注册 — 平台设置页也走贡献点通道（v5 §8.2，不再写死在 Shell 导航）。
/// Host 在模块 Contribute 之后调用。
/// </summary>
public sealed class ShellContributions(IContributionRegistry registry)
{
    /// <summary>设置页贡献（排序靠后：模块 → 设置）</summary>
    public void RegisterPlatformSettings()
    {
        registry.View("SettingsView", typeof(SettingsView));
        registry.SettingsPage(new SettingsPageContribution(
            "shell", "设置", "", 10000,
            sp => sp.GetRequiredService<SettingsViewModel>(),
            "SettingsView"));
    }
}
