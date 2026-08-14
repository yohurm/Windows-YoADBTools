using System.Globalization;
using System.Windows.Data;

namespace Yovo.Shell.Converters;

/// <summary>bool → 双态按钮文本（参数 "停止时文本|开始时文本"）</summary>
public sealed class BoolToCaptureTextConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var texts = (parameter as string ?? "停止|开始").Split('|');
        return value is true ? texts[0] : (texts.Length > 1 ? texts[1] : texts[0]);
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
