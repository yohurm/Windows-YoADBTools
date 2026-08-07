using System.Windows;
using System.Windows.Controls;

namespace FactoryHelper.Views;

/// <summary>
/// 通用参数输入对话框 — 根据提示列表动态生成输入框
/// </summary>
public partial class InputDialog : Window
{
    private readonly List<(TextBox Box, string Prompt)> _inputs = [];

    /// <summary>用户输入的参数值（按提示顺序）</summary>
    public List<string> Values { get; private set; } = [];

    public InputDialog(string title, string commandTemplate, List<string> prompts)
    {
        InitializeComponent();

        Title = $"参数输入 — {title}";
        TxtTitle.Text = title;
        TxtCommand.Text = $"命令模板: {commandTemplate}";

        // 动态生成输入框
        for (var i = 0; i < prompts.Count; i++)
        {
            var label = new TextBlock
            {
                Text = prompts[i],
                FontSize = 12,
                Margin = new Thickness(0, 0, 0, 3)
            };

            var textBox = new TextBox
            {
                FontSize = 13,
                Margin = new Thickness(0, 0, 0, 8),
                Padding = new Thickness(4, 2, 4, 2),
                MinHeight = 26
            };
            _inputs.Add((textBox, prompts[i]));

            // 第一个输入框获得焦点
            if (i == 0)
                textBox.Loaded += (_, _) => textBox.Focus();

            InputPanel.Children.Add(label);
            InputPanel.Children.Add(textBox);
        }
    }

    private void OnOkClick(object sender, RoutedEventArgs e)
    {
        // 校验：所有输入框不能为空
        foreach (var (box, prompt) in _inputs)
        {
            if (string.IsNullOrWhiteSpace(box.Text))
            {
                MessageBox.Show(this, $"请输入: {prompt}", "参数输入",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                box.Focus();
                return;
            }
        }

        Values = _inputs.Select(i => i.Box.Text.Trim()).ToList();
        DialogResult = true;
        Close();
    }

    private void OnCancelClick(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}