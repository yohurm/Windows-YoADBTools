using Yovo.Modules.FileManager.Domain;
using Xunit;

namespace Yovo.Modules.FileManager.Tests;

/// <summary>远程路径：规范化 / 穿越拒绝（C3）/ 安全根严格子路径（M9）</summary>
public class RemotePathTests
{
    // ===== Combine：拒绝穿越 =====

    [Fact]
    public void Combine_rejects_traversal_segments()
    {
        Assert.Null(RemotePath.Root.Combine(".."));
        Assert.Null(RemotePath.Root.Combine("a/../b"));
        Assert.Null(RemotePath.Root.Combine("../etc"));
        Assert.Null(RemotePath.Root.Combine("."));
        Assert.Null(RemotePath.Root.Combine("/etc"));          // 绝对段
        Assert.Null(RemotePath.Root.Combine("a/"));            // 尾斜杠
        Assert.Null(RemotePath.Root.Combine(""));
        Assert.Null(RemotePath.Root.Combine("   "));
    }

    [Fact]
    public void Combine_accepts_plain_names()
    {
        // 注意：`!` 不改变静态类型（仍为 RemotePath?），需显式取值
        RemotePath sdcard = RemotePath.Root.Combine("sdcard")!.Value;
        Assert.Equal("/sdcard/data.bin", sdcard.Combine("data.bin")!.Value.Value);
        Assert.Equal("/sdcard/a b.txt", sdcard.Combine("a b.txt")!.Value.Value);
    }

    [Fact]
    public void Combine_rejects_after_traversal_attempt()
    {
        // 已含 ".." 的输入任何组合都拒绝
        RemotePath p = RemotePath.Root.Combine("sdcard")!.Value;
        Assert.Null(p.Combine("sub/.."));
        Assert.Null(p.Combine(".."));
    }

    // ===== TryParse：规范化 =====

    [Fact]
    public void TryParse_normalizes_dot_and_dotdot()
    {
        Assert.True(RemotePath.TryParse("/sdcard/../etc", out var p));
        Assert.Equal("/etc", p.Value);                          // ".." 弹栈
        Assert.True(RemotePath.TryParse("/sdcard/./a", out p));
        Assert.Equal("/sdcard/a", p.Value);                     // "." 忽略
        Assert.True(RemotePath.TryParse("/sdcard///a//", out p));
        Assert.Equal("/sdcard/a", p.Value);                     // 冗余斜杠
    }

    [Fact]
    public void TryParse_rejects_relative_and_empty()
    {
        Assert.False(RemotePath.TryParse("", out _));
        Assert.False(RemotePath.TryParse("   ", out _));
        Assert.False(RemotePath.TryParse("sdcard/x", out _));   // 非绝对路径
        Assert.False(RemotePath.TryParse(null, out _));
    }

    // ===== 安全根严格子路径（M9：禁止等于安全根） =====

    [Theory]
    [InlineData("/sdcard", false)]           // 等于安全根 → 不允许
    [InlineData("/storage", false)]          // 等于安全根 → 不允许
    [InlineData("/", false)]                 // 根 → 不允许
    [InlineData("/system", false)]           // 安全根外 → 不允许
    [InlineData("/sdcard2", false)]          // 前缀误判（sdcard2 ≠ sdcard）→ 不允许
    [InlineData("/storage/emulated/0", true)]   // 严格子路径 → 允许
    [InlineData("/sdcard/data", true)]       // 严格子路径 → 允许
    public void IsSafeForDestructiveOps_strict_subpath(string value, bool expected)
    {
        Assert.Equal(expected, new RemotePath(value).IsSafeForDestructiveOps);
    }

    [Fact]
    public void Parent_and_display_name()
    {
        Assert.Null(RemotePath.Root.Parent);
        Assert.Equal("/", RemotePath.Root.DisplayName);
        RemotePath sdcard = RemotePath.Root.Combine("sdcard")!.Value;
        Assert.Equal("/", sdcard.Parent!.Value.Value); // "/sdcard" 的父为根
        RemotePath file = sdcard.Combine("data.bin")!.Value;
        Assert.Equal("/sdcard", file.Parent!.Value.Value);
        Assert.Equal("data.bin", file.DisplayName);
    }
}
