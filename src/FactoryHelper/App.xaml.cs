using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using FactoryHelper.Services;
using FactoryHelper.ViewModels;

namespace FactoryHelper;

public partial class App : Application
{
    public static IServiceProvider ServiceProvider { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var services = new ServiceCollection();

        // 注册服务
        services.AddSingleton<AdbService>();
        services.AddSingleton<ConfigService>();
        services.AddSingleton<IMesService, MesService>();

        // 注册 ViewModel
        services.AddTransient<MainViewModel>();

        ServiceProvider = services.BuildServiceProvider();

        var mainWindow = new MainWindow();
        mainWindow.Show();
    }
}