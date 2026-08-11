using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace Yovo.Shell.Converters;

/// <summary>bool → TextWrapping（true=Wrap 软换行；false=NoWrap）</summary>
public sealed class BoolToTextWrappingConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is true ? TextWrapping.Wrap : TextWrapping.NoWrap;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
