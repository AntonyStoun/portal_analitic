param([string]$Img = "C:\Users\user\Documents\Strata\Workspace\imsges\exemple.png")
Add-Type -AssemblyName System.Drawing
$b = [System.Drawing.Bitmap]::FromFile($Img)
$W = $b.Width; $H = $b.Height
Write-Output "IMG $W x $H"
$sum = @{}
for ($y = 0; $y -lt $H; $y += 13) {
  for ($x = 0; $x -lt $W; $x += 13) {
    $c = $b.GetPixel($x, $y)
    $r = [int]([math]::Floor($c.R / 24) * 24)
    $g = [int]([math]::Floor($c.G / 24) * 24)
    $l = [int]([math]::Floor($c.B / 24) * 24)
    $k = '{0:x2}{1:x2}{2:x2}' -f $r, $g, $l
    if ($sum.ContainsKey($k)) { $sum[$k] = $sum[$k] + 1 } else { $sum[$k] = 1 }
  }
}
$b.Dispose()
$sum.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 18 | ForEach-Object {
  Write-Output ("#{0}  x{1}" -f $_.Key, $_.Value)
}
