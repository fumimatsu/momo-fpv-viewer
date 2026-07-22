param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',
    [string]$Runtime = 'win-x64'
)

$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = Join-Path $scriptRoot 'MomoFpvFfbBridge\MomoFpvFfbBridge.csproj'
$artifacts = Join-Path $scriptRoot 'artifacts'
$publishDir = Join-Path $artifacts "MomoFpvFfbBridge-$Runtime"
$zipPath = Join-Path $artifacts "MomoFpvFfbBridge-$Runtime.zip"

Remove-Item -LiteralPath $publishDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue

& dotnet publish $project -c $Configuration -r $Runtime --self-contained true -p:PublishSingleFile=false -o $publishDir
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed with exit code $LASTEXITCODE." }

Copy-Item -LiteralPath (Join-Path $scriptRoot 'README.md') -Destination (Join-Path $publishDir 'README.md')
Compress-Archive -Path (Join-Path $publishDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Created $zipPath"
