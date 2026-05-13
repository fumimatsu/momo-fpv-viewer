param(
  [string]$HostAddress = "192.168.11.2:8080",
  [string]$DeviceId = "",
  [ValidateSet("p2p", "ayame")]
  [string]$Signaling = "p2p",
  [string]$AyameUrl = "",
  [string]$RoomId = "",
  [string]$ClientId = "",
  [string]$SignalingKey = "",
  [int]$Port = 18080,
  [switch]$DebugOsd,
  [switch]$NoAutoReconnect,
  [switch]$VideoReconnect,
  [switch]$NoFlip,
  [switch]$Mirror,
  [ValidateSet("off", "once", "poll", "debug")]
  [string]$DeviceStatus = "off"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Find-Python {
  $candidates = @(
    @{ File = "py"; Args = @("-3") },
    @{ File = "python"; Args = @() },
    @{ File = "python3"; Args = @() }
  )

  foreach ($candidate in $candidates) {
    $command = Get-Command $candidate.File -ErrorAction SilentlyContinue
    if ($null -eq $command) {
      continue
    }
    return $candidate
  }

  throw 'Python was not found. Install Python 3 or enable py -3.'
}

function Test-PortOpen {
  param([int]$TargetPort)

  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $task = $client.ConnectAsync("127.0.0.1", $TargetPort)
    $ok = $task.Wait(300)
    $client.Close()
    return $ok
  } catch {
    return $false
  }
}

$python = Find-Python

if (-not (Test-PortOpen -TargetPort $Port)) {
  $args = @()
  $args += $python.Args
  $args += @("-m", "http.server", "$Port", "--bind", "127.0.0.1")
  Start-Process -FilePath $python.File -ArgumentList $args -WorkingDirectory $ScriptDir -WindowStyle Hidden
  Start-Sleep -Milliseconds 800
}

$query = @(
  "host=$([uri]::EscapeDataString($HostAddress))"
)

if ($Signaling -ne "p2p") {
  $query += "signaling=$([uri]::EscapeDataString($Signaling))"
}
if ($DebugOsd) {
  $query += "debug=1"
}
if ($DeviceId -ne "") {
  $query += "id=$([uri]::EscapeDataString($DeviceId))"
}
if ($AyameUrl -ne "") {
  $query += "ayameUrl=$([uri]::EscapeDataString($AyameUrl))"
}
if ($Signaling -eq "ayame") {
  $query += "deviceHost=$([uri]::EscapeDataString($HostAddress))"
}
if ($RoomId -ne "") {
  $query += "roomId=$([uri]::EscapeDataString($RoomId))"
}
if ($ClientId -ne "") {
  $query += "clientId=$([uri]::EscapeDataString($ClientId))"
}
if ($SignalingKey -ne "") {
  $query += "signalingKey=$([uri]::EscapeDataString($SignalingKey))"
}
if ($VideoReconnect -or $Signaling -eq "ayame") {
  $query += "videoReconnect=1"
}
if ($NoAutoReconnect) {
  $query += "autoReconnect=0"
}
if ($DeviceStatus -ne "off") {
  $query += "deviceStatus=$([uri]::EscapeDataString($DeviceStatus))"
}
if ($NoFlip) {
  $query += "flip=0"
}
if ($Mirror) {
  $query += "mirror=1"
}

$query = $query -join "&"

$url = "http://127.0.0.1:$Port/viewer.html?$query"
Write-Host $url
Start-Process $url
