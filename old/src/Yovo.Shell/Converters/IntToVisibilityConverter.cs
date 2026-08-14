using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace Yovo.Shell.Converters;

/// <summary>int &gt; 0 显示，否则折叠（信号计数徽章等）</summary>
public sealed class IntToVisibilityConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is int count && count > 0 ? Visibility.Visible : Visibility.Collapsed;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
