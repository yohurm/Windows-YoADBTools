using System.Windows;
using System.Windows.Controls;
using FactoryHelper.Models;

namespace FactoryHelper.Views;

/// <summary>
/// 命令组参数输入对话框 — 收集命令组中所有需要输入步骤的参数
/// </summary>
public partial class MultiStepInputDialog : Window
{
    private readonly List<(TextBox Box, string StepDesc, string Prompt)> _inputs = [];

    /// <summary>各输入步骤的参数值，与输入步骤顺序对应</summary>
    public List<string> Values { get; private set; } = [];

    public MultiStepInputDialog(string groupName, List<(int StepNo, string Desc, string Command, List<string> Prompts)> inputSteps)
    {
        InitializeComponent();

        Title = $"参数输入 — {groupName}";
        TxtTitle.Text = groupName;

        foreach (var (stepNo, desc, command, prompts) in inputSteps)
        {
            // 步骤说明
            var header = new TextBlock
            {
                Text = $"步骤 {stepNo}: {desc}",
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Margin = new Thickness(0, 0, 0, 2),
                Foreground = new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x8a, 0x5a, 0x00))
            };
            InputPanel.Children.Add(header);

            var cmdText = new TextBlock
            {
                Text = command,
                FontSize = 10,
                Foreground = System.Windows.Media.Brushes.Gray,
                Margin = new Thickness(0, 0, 0, 4),
                TextWrapping = TextWrapping.Wrap
            };
            InputPanel.Children.Add(cmdText);

            // 该步骤的输入框
            foreach (var prompt in prompts)
            {
                var label = new TextBlock
                {
                    Text = prompt,
                    FontSize = 11,
                    Margin = new Thickness(0, 0, 0, 2)
                };
                var textBox = new TextBox
                {
                    FontSize = 13,
                    Margin = new Thickness(0, 0, 0, 8),
                    Padding = new Thickness(4, 2, 4, 2),
                    MinHeight = 26
                };
                _inputs.Add((textBox, $"{desc} / {prompt}", prompt));
                InputPanel.Children.Add(label);
                InputPanel.Children.Add(textBox);
            }
        }

        // 第一个输入框获得焦点
        if (_inputs.Count > 0)
            _inputs[0].Box.Loaded += (_, _) => _inputs[0].Box.Focus();
    }

    private void OnOkClick(object sender, RoutedEventArgs e)
    {
        foreach (var (box, stepDesc, prompt) in _inputs)
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