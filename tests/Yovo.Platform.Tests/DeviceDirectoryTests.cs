using Yovo.Platform.Devices;
using Xunit;

namespace Yovo.Platform.Tests;

/// <summary>设备目录输出解析（devices -l 行格式）</summary>
public class DeviceDirectoryTests
{
    [Fact]
    public void ParseDevices_parses_serial_state_model()
    {
        const string output = """
        List of devices attached
        V2361A         device product:yorifuji model:SM_V2361A device:yorifuji transport_id:1
        emulator-5554  offline product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64
        """;

        var devices = DeviceDirectory.ParseDevices(output);

        Assert.Equal(2, devices.Count);
        Assert.Equal("V2361A", devices[0].Serial.Value);
        Assert.Equal("device", devices[0].State);
        Assert.True(devices[0].IsOnline);
        Assert.Equal("SM_V2361A", devices[0].Model);
        Assert.Equal("SM_V2361A (V2361A)", devices[0].DisplayName);
        Assert.False(devices[1].IsOnline);
    }

    [Fact]
    public void ParseDevices_ignores_header_and_empty_lines()
    {
        const string output = """
        List of devices attached

        """;

        Assert.Empty(DeviceDirectory.ParseDevices(output));
    }

    [Fact]
    public void ParseDevices_handles_model_without_prefix_and_unknown_model()
    {
        const string output = """
        List of devices attached
        serial1  device
        serial2  unauthorized product:p1 model:模型
        """;

        var devices = DeviceDirectory.ParseDevices(output);

        Assert.Null(devices[0].Model);
        Assert.Equal("serial1", devices[0].DisplayName);
        Assert.Equal("模型", devices[1].Model);
    }
}
