# To run: pwsh ./scripts/export-code.ps1

# ============================================================
# Project Code Dump Script (Monorepo / Chat-friendly)
# ============================================================

$root = (Resolve-Path ".").Path
$outputFile = Join-Path $root "project_dump.txt"

# Remove old dump if it exists
if (Test-Path $outputFile) {
    Remove-Item $outputFile
}

Write-Host "Creating project dump..."

function IsExcludedPath($fullName) {
    return ($fullName -match "(^|[\\/])(node_modules|dist|\.git|\.idea|\.vscode|target|build|out|coverage|tmp|\.next)([\\/]|$)")
}

function IsExcludedFile($file) {
    $name = $file.Name
    $extension = $file.Extension.ToLowerInvariant()

    if ($name -eq "project_dump.txt") { return $true }

    $excludedExtensions = @(
        ".class", ".jar", ".war", ".ear",
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
        ".zip", ".tar", ".gz", ".7z",
        ".exe", ".dll", ".so", ".dylib",
        ".db", ".sqlite", ".sqlite3",
        ".lock"
    )

    return $excludedExtensions -contains $extension
}

function GetProjectFiles($basePath, $extensions) {
    if (-not (Test-Path $basePath)) {
        return @()
    }

    return Get-ChildItem -Path $basePath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { -not (IsExcludedPath $_.FullName) } |
        Where-Object { -not (IsExcludedFile $_) } |
        Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() }
}

function GetNamedFiles($basePath, $names) {
    if (-not (Test-Path $basePath)) {
        return @()
    }

    return Get-ChildItem -Path $basePath -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { -not (IsExcludedPath $_.FullName) } |
        Where-Object { -not (IsExcludedFile $_) } |
        Where-Object { $names -contains $_.Name }
}

$files = @()

$codeExtensions = @(
    ".md",
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".java", ".kt", ".kts",
    ".html", ".css", ".scss",
    ".json",
    ".xml",
    ".yml", ".yaml",
    ".properties",
    ".sql",
    ".sh", ".ps1", ".bat",
    ".env", ".example",
    ".conf"
)

$importantFileNames = @(
    "package.json",
    "package-lock.json",
    "pom.xml",
    "tsconfig.json",
    "vite.config.ts",
    "vite.config.js",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Dockerfile",
    ".dockerignore",
    ".gitignore",
    ".env",
    ".env.example",
    "README.md"
)

if (Test-Path "$root/apps") {
    $files += GetProjectFiles "$root/apps" $codeExtensions
    $files += GetNamedFiles "$root/apps" $importantFileNames
}

if (Test-Path "$root/packages") {
    $files += GetProjectFiles "$root/packages" $codeExtensions
    $files += GetNamedFiles "$root/packages" $importantFileNames
}

if (Test-Path "$root/infra") {
    $files += GetProjectFiles "$root/infra" $codeExtensions
    $files += GetNamedFiles "$root/infra" $importantFileNames
}

if (Test-Path "$root/docs") {
    $files += GetProjectFiles "$root/docs" $codeExtensions
}

$topLevelFiles = Get-ChildItem -Path $root -File -ErrorAction SilentlyContinue |
    Where-Object { -not (IsExcludedFile $_) } |
    Where-Object {
        $importantFileNames -contains $_.Name -or
        $codeExtensions -contains $_.Extension.ToLowerInvariant()
    }
$files += $topLevelFiles

foreach ($name in $importantFileNames) {
    $path = Join-Path $root $name
    if (Test-Path -LiteralPath $path) {
        $item = Get-Item -LiteralPath $path -ErrorAction SilentlyContinue
        if ($null -ne $item) {
            $files += $item
        }
    }
}

$files = $files |
    Where-Object { $_ -ne $null } |
    Where-Object { -not (IsExcludedPath $_.FullName) } |
    Where-Object { -not (IsExcludedFile $_) } |
    Sort-Object FullName -Unique

Add-Content $outputFile "PROJECT CODE DUMP"
Add-Content $outputFile "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Add-Content $outputFile "Root: $root"
Add-Content $outputFile ""

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
