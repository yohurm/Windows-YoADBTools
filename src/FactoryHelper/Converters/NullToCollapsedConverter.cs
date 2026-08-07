using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace FactoryHelper.Converters;

/// <summary>
/// 值非空时显示，空时折叠（用于可选标签等）
/// </summary>
public class NullToCollapsedConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return string.IsNullOrEmpty(value as string) ? Visibility.Collapsed : Visibility.Visible;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotSupportedException();
    }
}