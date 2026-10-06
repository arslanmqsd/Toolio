/**
 * Templates bundled from github.com/github/gitignore (CC0-1.0, see LICENSE in this folder), the same
 * source GitHub's "Add .gitignore" picker and gitignore.io draw from. Bundled rather than fetched so
 * the tool works offline and never calls out.
 *
 * Snapshot: 2026-10-06, upstream commit 0e5d690153ca3da8a4a1aef2d053406f408f531c.
 * Re-sync by hand now and then: download each `source` path from upstream over its `<id>.gitignore`
 * file here, keeping the bytes as they are (macOS.gitignore has a deliberate carriage return).
 */

export type TemplateCategory = "language" | "framework" | "os" | "ide" | "tool";

export interface TemplateMeta {
  id: string;
  label: string;
  category: TemplateCategory;
  /** Path of the template in github/gitignore. */
  source: string;
  /** Shown next to the label in the picker, never in the generated file. */
  note?: string;
  /** Other names people search or type for it. */
  aliases?: string[];
}

/** In display order. Merged output follows this order too, whatever order templates were picked in. */
export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "language", label: "Languages" },
  { id: "framework", label: "Frameworks" },
  { id: "tool", label: "Tools" },
  { id: "ide", label: "Editors and IDEs" },
  { id: "os", label: "Operating systems" },
];

export const TEMPLATES: TemplateMeta[] = [
  { id: "node", label: "Node", category: "language", source: "Node.gitignore", aliases: ["nodejs", "javascript", "typescript", "npm", "yarn", "react"] },
  { id: "python", label: "Python", category: "language", source: "Python.gitignore", aliases: ["django", "flask", "pip"] },
  { id: "java", label: "Java", category: "language", source: "Java.gitignore" },
  { id: "kotlin", label: "Kotlin", category: "language", source: "Kotlin.gitignore" },
  { id: "go", label: "Go", category: "language", source: "Go.gitignore", aliases: ["golang"] },
  { id: "rust", label: "Rust", category: "language", source: "Rust.gitignore", aliases: ["cargo"] },
  { id: "ruby", label: "Ruby", category: "language", source: "Ruby.gitignore", aliases: ["gem", "bundler"] },
  { id: "php", label: "PHP", note: "Composer", category: "language", source: "Composer.gitignore", aliases: ["composer"] },
  { id: "swift", label: "Swift", category: "language", source: "Swift.gitignore", aliases: ["ios"] },
  { id: "cpp", label: "C++", category: "language", source: "C++.gitignore", aliases: ["cplusplus"] },
  { id: "dotnet", label: ".NET", category: "language", source: "Dotnet.gitignore", aliases: ["net", "csharp", "c#"] },
  { id: "nextjs", label: "Next.js", category: "framework", source: "Nextjs.gitignore", aliases: ["next"] },
  { id: "angular", label: "Angular", category: "framework", source: "Angular.gitignore" },
  { id: "vue", label: "Vue", category: "framework", source: "community/JavaScript/Vue.gitignore", aliases: ["vuejs"] },
  { id: "rails", label: "Rails", category: "framework", source: "Rails.gitignore", aliases: ["ruby on rails"] },
  { id: "laravel", label: "Laravel", category: "framework", source: "Laravel.gitignore" },
  { id: "symfony", label: "Symfony", category: "framework", source: "Symfony.gitignore" },
  { id: "android", label: "Android", category: "framework", source: "Android.gitignore" },
  { id: "unity", label: "Unity", category: "framework", source: "Unity.gitignore" },
  { id: "terraform", label: "Terraform", category: "tool", source: "Terraform.gitignore", aliases: ["tf"] },
  { id: "gradle", label: "Gradle", category: "tool", source: "Gradle.gitignore" },
  { id: "maven", label: "Maven", category: "tool", source: "Maven.gitignore" },
  { id: "vscode", label: "VS Code", category: "ide", source: "Global/VisualStudioCode.gitignore", aliases: ["visual studio code", "code"] },
  {
    id: "jetbrains",
    label: "JetBrains",
    note: "IntelliJ, PyCharm, WebStorm…",
    category: "ide",
    source: "Global/JetBrains.gitignore",
    aliases: ["intellij", "idea", "pycharm", "webstorm", "phpstorm", "goland", "rider", "rubymine", "clion", "android studio"],
  },
  { id: "visualstudio", label: "Visual Studio", category: "ide", source: "VisualStudio.gitignore", aliases: ["vs"] },
  { id: "xcode", label: "Xcode", category: "ide", source: "Global/Xcode.gitignore" },
  { id: "vim", label: "Vim", category: "ide", source: "Global/Vim.gitignore", aliases: ["neovim", "nvim"] },
  { id: "sublimetext", label: "Sublime Text", category: "ide", source: "Global/SublimeText.gitignore", aliases: ["sublime"] },
  { id: "eclipse", label: "Eclipse", category: "ide", source: "Global/Eclipse.gitignore" },
  { id: "macos", label: "macOS", category: "os", source: "Global/macOS.gitignore", aliases: ["mac", "osx", "darwin"] },
  { id: "windows", label: "Windows", category: "os", source: "Global/Windows.gitignore", aliases: ["win"] },
  { id: "linux", label: "Linux", category: "os", source: "Global/Linux.gitignore" },
];

export interface StackPreset {
  id: string;
  label: string;
  templates: string[];
}

export const STACK_PRESETS: StackPreset[] = [
  { id: "node", label: "Node + VS Code + macOS", templates: ["node", "vscode", "macos"] },
  { id: "nextjs", label: "Next.js + VS Code + macOS", templates: ["node", "nextjs", "vscode", "macos"] },
  { id: "python", label: "Python + PyCharm + macOS", templates: ["python", "jetbrains", "macos"] },
  { id: "java", label: "Java + IntelliJ + Windows", templates: ["java", "jetbrains", "windows"] },
  { id: "go", label: "Go + VS Code + Linux", templates: ["go", "vscode", "linux"] },
  { id: "dotnet", label: ".NET + Visual Studio + Windows", templates: ["dotnet", "visualstudio", "windows"] },
];

export const DEFAULT_PRESET = STACK_PRESETS[0];
