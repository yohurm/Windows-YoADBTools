using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace Yovo.Shell.Converters;

/// <summary>bool 取反 → Visibility（true 折叠）</summary>
public sealed class InverseBoolToVisibilityConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is true ? Visibility.Collapsed : Visibility.Visible;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
