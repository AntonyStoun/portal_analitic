<#
  check-portal.ps1 — быстрая самопроверка портала настоящим браузером
  Открывает index.html в headless Chrome/Edge, выводит ошибки JS и количество
  отрисованных элементов. Ничего не отправляет в сеть.
  Запуск:  powershell -ExecutionPolicy Bypass -File tools\check-portal.ps1
#>
[CmdletBinding()]
param([string]$Root = '', [int]$BudgetMs = 6000, [string]$Uri = '')
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Root)) {
  if ($PSScriptRoot) { $Root = Split-Path -Parent $PSScriptRoot } else { $Root = (Get-Location).Path }
}
$Root = (Resolve-Path $Root).Path
function CountOf([string]$needle,[string]$hay){
  if (-not $hay) { return 0 }
  $i = 0; $pos = 0
  while ($true) {
    $pos = $hay.IndexOf($needle, $pos)
    if ($pos -lt 0) { break }
    $i++; $pos = $pos + $needle.Length
  }
  return $i
}
$page = Join-Path $Root 'index.html'
if (-not (Test-Path $page)) { Write-Host "нет страницы: $page" -ForegroundColor Red; exit 2 }
$url = 'file:///' + ($page -replace '\\','/')
if (-not [string]::IsNullOrWhiteSpace($Uri)) { $url = $Uri }

$candidates = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
)
$bin = $null
foreach ($c in $candidates) { if (Test-Path $c) { $bin = $c; break } }
if (-not $bin) { Write-Host 'Chrome/Edge не найден — проверка пропущена' -ForegroundColor Yellow; exit 0 }

$tmp = Join-Path $env:TEMP 'hunter-check-profile'
$log = Join-Path $env:TEMP 'hunter-check-console.txt'
$dom = Join-Path $env:TEMP 'hunter-check-dom.html'

$modes = @(
  @{ name='контур по умолчанию';  q='' },
  @{ name='реестр примэрий (Д)';  q='?scope=MD&topic=E' },
  @{ name='планетарный контур';   q='?scope=WORLD&topic=F' }
)
Write-Host ''
Write-Host '  САМОТЕСТ ПОРТАЛА' -ForegroundColor Cyan
Write-Host ('  браузер:  ' + (Split-Path -Leaf $bin))
Write-Host ('  страница: ' + $url)
Write-Host ''

$allBad = @()
foreach ($m in $modes){
  Remove-Item $log,$dom -Force -ErrorAction SilentlyContinue
  $prevEA = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & $bin --headless=new --disable-gpu --user-data-dir="$tmp" --virtual-time-budget=$BudgetMs `
        --enable-logging=stderr --dump-dom ($url + $m.q) 2>$log | Out-File -Encoding UTF8 $dom
  $ErrorActionPreference = $prevEA

  $html = ''
  if (Test-Path $dom) { $html = Get-Content $dom -Raw -Encoding UTF8 }
  $bad = @()
  if (Test-Path $log) {
    $bad = @(Get-Content $log -ErrorAction SilentlyContinue | Select-String 'CONSOLE' |
             Where-Object { $_.Line -match 'Uncaught|SyntaxError|TypeError|ReferenceError|RangeError' })
  }
  $allBad += $bad

  Write-Host ('  ' + $m.name) -ForegroundColor White
  if ($bad.Count) {
    foreach ($b in $bad) { Write-Host ('     ! ' + (($b.Line -split 'CONSOLE')[-1]).Trim()) -ForegroundColor Red }
  } else {
    Write-Host '     ошибок JS нет' -ForegroundColor Green
  }
  $marks = [ordered]@{
    'ноды масштаба'   = 'class="node scope';
    'ноды блоков'     = 'class="node topic';
    'связи'           = '<path';
    'карточки'        = 'class="card';
    'строки реестра'  = 'class="reg-row';
    'сайты в реестре' = 'class="site"';
  }
  $line = ''
  foreach ($k in $marks.Keys) { $line += ('{0}: {1}   ' -f $k, (CountOf $marks[$k] $html)) }
  Write-Host ('     ' + $line + ' · DOM {0:N0} байт' -f $html.Length) -ForegroundColor DarkGray
  Write-Host ''
}

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
if ($allBad.Count) { Write-Host ('  ИТОГО ошибок: ' + $allBad.Count) -ForegroundColor Red; exit 1 }
Write-Host '  ИТОГО: чисто' -ForegroundColor Green
exit 0
