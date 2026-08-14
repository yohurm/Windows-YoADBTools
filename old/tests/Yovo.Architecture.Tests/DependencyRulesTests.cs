using NetArchTest.Rules;
using Xunit;

namespace Yovo.Architecture.Tests;

/// <summary>
/// 架构依赖规则（v5 §6.2）— CI 失败即构建失败。
/// 编译期引用矩阵（csproj）已强制第一层；此处做类型级第二层强制。
/// </summary>
public class DependencyRulesTests
{
    private const string AbstractionsNs = "Yovo.Platform.Abstractions";
    private const string PlatformNs = "Yovo.Platform";
    private const string ShellNs = "Yovo.Shell";
    private const string ModulesNs = "Yovo.Modules";
    private const string HostNs = "Yovo.Host";

    // ===== 规则 1：模块间零实现依赖 =====

    [Fact]
    public void Modules_do_not_depend_on_each_other()
    {
        var moduleTypes = Types.InAssemblies(AllAssemblies.Modules)
            .That().ResideInNamespace(ModulesNs)
            .GetTypes();

        foreach (var moduleAssembly in AllAssemblies.Modules)
        {
            var otherModuleNamespaces = AllAssemblies.Modules
                .Where(a => a != moduleAssembly)
                .Select(a => $"Yovo.Modules.{a.GetName().Name.Replace("Yovo.Modules.", "")}");

            var result = Types.InAssembly(moduleAssembly)
                .That().ResideInNamespace(ModulesNs)
                .Should().NotHaveDependencyOnAny(otherModuleNamespaces.ToArray())
                .GetResult();

            Assert.True(result.IsSuccessful,
                $"模块 {moduleAssembly.GetName().Name} 引用了其他模块: {string.Join(", ", result.FailingTypeNames ?? [])}");
        }
    }

    // ===== 规则 2：Platform.Abstractions 不得引用 System.Windows =====

    [Fact]
    public void Abstractions_do_not_reference_wpf()
    {
        var result = Types.InAssembly(AllAssemblies.Abstractions)
            .Should().NotHaveDependencyOn("PresentationFramework")
            .And().NotHaveDependencyOn("PresentationCore")
            .And().NotHaveDependencyOn("WindowsBase")
            .GetResult();

        Assert.True(result.IsSuccessful,
            $"Abstractions 引用了 WPF: {string.Join(", ", result.FailingTypeNames ?? [])}");
    }

    // ===== 规则 3：Platform 不依赖 Shell / Modules =====

    [Fact]
    public void Platform_does_not_depend_on_shell_or_modules()
    {
        var result = Types.InAssembly(AllAssemblies.Platform)
            .Should().NotHaveDependencyOnAny(ShellNs, ModulesNs)
            .GetResult();

        Assert.True(result.IsSuccessful,
            $"Platform 引用了 Shell/Modules: {string.Join(", ", result.FailingTypeNames ?? [])}");
    }

    // ===== 规则 4：仅 Host 可引用全部模块程序集 =====

    [Fact]
    public void Shell_does_not_depend_on_modules()
    {
        var result = Types.InAssembly(AllAssemblies.Shell)
            .Should().NotHaveDependencyOnAny(ModulesNs)
            .GetResult();

        Assert.True(result.IsSuccessful,
            $"Shell 引用了模块实现: {string.Join(", ", result.FailingTypeNames ?? [])}");
    }

    // ===== 规则 5：Platform.Abstractions 不含实现类（只允许 接口/record/枚举） =====

    [Fact]
    public void Abstractions_only_contain_interfaces_and_value_objects()
    {
        var violations = AllAssemblies.Abstractions.GetTypes()
            .Where(t => t.IsInterface == false && t.IsEnum == false
                     && !IsRecordLike(t)
                     && !t.Name.StartsWith('<')) // 编译器生成（<Module> 等）
            .Select(t => t.FullName)
            .ToList();

        Assert.Empty(violations);
    }

    /// <summary>record 特征：编译器为 record/record struct 生成 op_Equality 静态运算符</summary>
    private static bool IsRecordLike(Type type)
        => type.GetMethod("op_Equality", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static) != null;

    private static class AllAssemblies
    {
        public static readonly System.Reflection.Assembly Abstractions =
            typeof(Yovo.Platform.Abstractions.IAppPaths).Assembly;
        public static readonly System.Reflection.Assembly Platform =
            typeof(Yovo.Platform.AppPaths).Assembly;
        public static readonly System.Reflection.Assembly Shell =
            typeof(Yovo.Shell.ViewModels.ShellViewModel).Assembly;

        public static readonly System.Reflection.Assembly[] Modules =
        [
            typeof(Yovo.Modules.AdbTerminal.AdbTerminalModule).Assembly,
            typeof(Yovo.Modules.FileManager.FileManagerModule).Assembly,
            typeof(Yovo.Modules.LogAnalyzer.LogAnalyzerModule).Assembly,
        ];
    }
}
