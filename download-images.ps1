# Letölti az ideiglenes fotókat a fő oldalról (artofsushi.hu, 2025/02) az images\ mappába.
# A régi /istvan/ oldal képei már nem elérhetők (404), ezért ezek helyettesítik őket, amíg nincsenek eredeti fotók.
# Futtatás: jobb klikk -> "Run with PowerShell", vagy:  powershell -ExecutionPolicy Bypass -File download-images.ps1
$base = "https://artofsushi.hu/wp-content/uploads/2025/02/"
# cél fájlnév (amit az index.html használ) = forrás fájl a fő oldalon
$map = [ordered]@{
  "ART02955.jpg" = "SS-4.jpg";  "ART02966.jpg" = "SS-5.jpg";  "ART02977.jpg" = "SS-15.jpg"; "ART02988.jpg" = "SS-3.jpg"
  "ART02922.jpg" = "SS-1.jpg";  "ART02933.jpg" = "SS-13.jpg"; "1-3.jpg"      = "SS-22.jpg"; "1-4.jpg"      = "SS-23.jpg"
  "2-1.jpg"      = "SS-6.jpg";  "2-2.jpg"      = "SS-10.jpg"; "2-3.jpg"      = "SS-24.jpg"; "2-4.jpg"      = "SS-5.jpg"
  "2-5.jpg"      = "SS-23.jpg"; "2-6.jpg"      = "SS-15.jpg"; "2-7.jpg"      = "SS-1.jpg";  "2-8.jpg"      = "SS-13.jpg"
}
$dir = Join-Path $PSScriptRoot "images"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($f in $map.Keys) {
  $out = Join-Path $dir $f
  try { Invoke-WebRequest -Uri ($base + $map[$f]) -OutFile $out -UseBasicParsing; Write-Host "OK  $f <- $($map[$f])" }
  catch { Write-Host "HIBA $f : $($_.Exception.Message)" }
}
Write-Host "Kesz."
