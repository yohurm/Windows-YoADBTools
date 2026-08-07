using System.Windows;
using System.Windows.Controls;
using Microsoft.Extensions.DependencyInjection;
using FactoryHelper.Models;
using FactoryHelper.ViewModels;

namespace FactoryHelper;

public partial class MainWindow : Window
{
    private readonly MainViewModel _viewModel;

    public MainWindow()
    {
        InitializeComponent();

        _viewModel = App.ServiceProvider.GetRequiredService<MainViewModel>();
        DataContext = _viewModel;

        Loaded += OnLoaded;
        DeviceListBox.SelectionChanged += OnDeviceSelectionChanged;

        // 绑定 ProgressBar 可见性
        _viewModel.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(MainViewModel.IsBusy))
                BusyProgressBar.Visibility = _viewModel.IsBusy
                    ? Visibility.Visible : Visibility.Collapsed;
        };
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        var adb = App.ServiceProvider.GetRequiredService<Services.AdbService>();
        TxtAdbStatus.Text = adb.IsAvailable() ? "已就绪" : "未找到";
        TxtAdbStatus.Foreground = adb.IsAvailable()
            ? new System.Windows.Media.SolidColorBrush(System.Windows.Media.Colors.Green)
            : new System.Windows.Media.SolidColorBrush(System.Windows.Media.Colors.Red);

        await _viewModel.InitializeAsync();
    }

    private void OnDeviceSelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        _viewModel.SelectedDevices.Clear();
        foreach (var item in DeviceListBox.SelectedItems)
        {
            if (item is AdbDevice device)
                _viewModel.SelectedDevices.Add(device);
        }
    }
}