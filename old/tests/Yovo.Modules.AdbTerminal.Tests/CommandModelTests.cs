using Yovo.Modules.AdbTerminal.Domain;
using Xunit;

namespace Yovo.Modules.AdbTerminal.Tests;

/// <summary>命令模型：占位符解析 / 输入提示文本 / 深拷贝 / JSON 契约兼容</summary>
public class CommandModelTests
{
    [Fact]
    public void PlaceholderCount_counts_max_plus_one()
    {
        Assert.Equal(0, new CommandDefinition { Command = "shell echo hi" }.PlaceholderCount);
        Assert.Equal(1, new CommandDefinition { Command = "shell echo {0}" }.PlaceholderCount);
        Assert.Equal(2, new CommandDefinition { Command = "shell echo {1} {0}" }.PlaceholderCount);
    }

    [Fact]
    public void InputPromptsText_roundtrips_comma_separated()
    {
        var cmd = new CommandDefinition { InputPrompts = ["PCBID", "SN"] };
        Assert.Equal("PCBID, SN", cmd.InputPromptsText);
        Assert.True(cmd.RequiresInput);

        cmd.InputPromptsText = "A, B, C";
        Assert.Equal(3, cmd.InputPrompts.Count);
        Assert.False(new CommandDefinition().RequiresInput);
    }

    [Fact]
    public void DeepClone_is_independent()
    {
        var library = new CommandLibrary
        {
            Commands = [new CommandDefinition { Name = "原命令", Command = "shell x" }],
            Groups =
            [
                new CommandGroup
                {
                    Name = "组",
                    Steps = [new CommandDefinition { Name = "步骤", Command = "shell y" }]
                }
            ]
        };

        var clone = library.DeepClone();

        Assert.NotSame(library.Commands[0], clone.Commands[0]);
        clone.Commands[0].Name = "改过";
        clone.Groups[0].Steps[0].Name = "改过步骤";
        Assert.Equal("原命令", library.Commands[0].Name);
        Assert.Equal("步骤", library.Groups[0].Steps[0].Name);
    }

    [Fact]
    public void FromJson_reads_v4_camelCase_contract()
    {
        const string json = """
        {
          "version": 1,
          "commands": [
            {
              "name": "写号",
              "command": "shell bdft write -sn {0}",
              "inputPrompts": ["请输入SN"],
              "timeoutMs": 30000
            }
          ],
          "groups": []
        }
        """;

        var library = CommandLibrary.FromJson(json);

        Assert.NotNull(library);
        Assert.Single(library!.Commands);
        Assert.Equal("写号", library.Commands[0].Name);
        Assert.Equal(["请输入SN"], library.Commands[0].InputPrompts);
        Assert.Equal(30000, library.Commands[0].TimeoutMs);
    }

    [Fact]
    public void ToString_returns_name_for_uia()
    {
        var cmd = new CommandDefinition { Name = "命令A" };
        Assert.Equal("命令A", cmd.ToString());

        var group = new CommandGroup { Name = "组B" };
        Assert.Equal("组B", group.ToString());
    }

    [Fact]
    public void Categories_derives_from_command_and_group_categories()
    {
        var library = new CommandLibrary
        {
            Commands = [new CommandDefinition { Name = "c1", Category = "通用" }, new CommandDefinition { Name = "c2", Category = "Nori产测" }],
            Groups = [new CommandGroup { Name = "g1", Category = "Nori产测" }, new CommandGroup { Name = "g2" }]
        };

        Assert.Equal(["通用", "Nori产测"], library.Categories);
    }
}
