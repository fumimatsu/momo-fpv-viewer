param(
    [string]$ViewerOrigin = '',
    [ValidateSet('directinput', 'moza-directinput')]
    [string]$Backend = 'moza-directinput',
    [ValidateRange(0.02, 1.0)]
    [double]$MaxOutput = 1.0
)

$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'MomoFpvFfbBridge\MomoFpvFfbBridge.csproj'
$dotnetArgs = @('run', '--project', $project, '--', '--backend', $Backend, '--max-output', $MaxOutput)

if ($ViewerOrigin) {
    $dotnetArgs += @('--allow-origin', $ViewerOrigin)
}

Write-Host "FFB Bridge を ws://127.0.0.1:24725 で開始します。最大出力: $MaxOutput"
Write-Host '停止は Ctrl+C。Viewer 側の Stop FFB でも即時に力を抜きます。'
& dotnet @dotnetArgs
