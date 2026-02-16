# To run type pwsh ./scripts/export-code.ps1


# ============================================================
# Project Code Dump Script (Focused / Chat-friendly)
# ============================================================

$root = (Resolve-Path ".").Path
$outputFile = Join-Path $root "project_dump.txt"

# Remove old dump if it exists
if (Test-Path $outputFile) {
    Remove-Item $outputFile
}

Write-Host "Creating project dump..."

$files = @()

# ------------------------------------------------------------
# 1) Include all TypeScript source files
# ------------------------------------------------------------
if (Test-Path "$root/src") {
    $files += Get-ChildItem -Path "$root/src" -Recurse -File -Filter "*.ts"
}

# ------------------------------------------------------------
# 2) Optional: include apps folder (if used)
# ------------------------------------------------------------
if (Test-Path "$root/apps") {
    $files += Get-ChildItem -Path "$root/apps" -Recurse -File -Filter "*.ts"
}

# ------------------------------------------------------------
# 3) Important root configuration files
# ------------------------------------------------------------
$importantFiles = @(
    "package.json",
    "tsconfig.json",
    "index.html"
)

foreach ($name in $importantFiles) {
    $path = Join-Path $root $name
    if (Test-Path -LiteralPath $path) {
        $item = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
        if ($null -ne $item) {
            $files += $item
        }
    }
}

# Remove duplicates and sort
$files = $files |
    Where-Object { $_ -ne $null } |
    Sort-Object FullName -Unique

# ------------------------------------------------------------
# Write header
# ------------------------------------------------------------
Add-Content $outputFile "PROJECT CODE DUMP"
Add-Content $outputFile "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Add-Content $outputFile "Root: $root"
Add-Content $outputFile ""

# ------------------------------------------------------------
# Write files
# ------------------------------------------------------------
foreach ($file in $files) {

    $relativePath = $file.FullName.Substring($root.Length).TrimStart('\','/')

    Add-Content $outputFile "============================================================"
    Add-Content $outputFile "FILE: $relativePath"
    Add-Content $outputFile "============================================================"
    Add-Content $outputFile ""

    try {
        Get-Content -LiteralPath $file.FullName |
            Add-Content $outputFile
    }
    catch {
        Add-Content $outputFile "[Could not read file]"
    }

    Add-Content $outputFile ""
    Add-Content $outputFile ""
}

Write-Host "Done! Output written to $outputFile"
