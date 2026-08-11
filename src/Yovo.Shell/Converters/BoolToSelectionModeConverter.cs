using System.Globalization;
using System.Windows.Controls;
using System.Windows.Data;

namespace Yovo.Shell.Converters;

/// <summary>bool（模块是否支持多选）→ ListBox SelectionMode</summary>
public sealed class BoolToSelectionModeConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is true ? SelectionMode.Extended : SelectionMode.Single;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}
