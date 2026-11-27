# Regenerate the static Windows overlay atlas. No runtime font or drawing dependency is needed.
Add-Type -AssemblyName System.Drawing
$size = 64
$atlas = [System.Drawing.Bitmap]::new($size * 10, $size * 10)
$graphics = [System.Drawing.Graphics]::FromImage($atlas)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$red = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#E5484D"))
$border = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 2)
$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
try {
  for ($index = 0; $index -lt 100; $index++) {
    $label = if ($index -eq 99) { "99+" } else { [string]($index + 1) }
    $x = ($index % 10) * $size
    $y = [math]::Floor($index / 10) * $size
    $graphics.FillEllipse($red, $x + 2, $y + 2, 60, 60)
    $graphics.DrawEllipse($border, $x + 2, $y + 2, 60, 60)
    $fontSize = if ($label.Length -eq 1) { 42 } elseif ($label.Length -eq 2) { 36 } else { 28 }
    $font = [System.Drawing.Font]::new("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    try {
      $bounds = [System.Drawing.RectangleF]::new($x, $y - 1, $size, $size)
      $graphics.DrawString($label, $font, [System.Drawing.Brushes]::White, $bounds, $format)
    } finally {
      $font.Dispose()
    }
  }
  $atlas.Save((Join-Path $PSScriptRoot "../assets/attention-badges.png"), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $format.Dispose()
  $border.Dispose()
  $red.Dispose()
  $graphics.Dispose()
  $atlas.Dispose()
}
