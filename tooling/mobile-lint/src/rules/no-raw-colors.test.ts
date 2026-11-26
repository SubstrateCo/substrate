import { ruleTester } from "../test-support.ts";
import { noRawColors } from "./no-raw-colors.ts";

ruleTester.run("no-raw-colors", noRawColors, {
  valid: [
    "const styles = StyleSheet.create({ row: { width: 17, gap: 6, borderRadius: 12, opacity: .5, transform: [{ translateX: -4 }] } });",
    "<View style={{ flex: 1, paddingHorizontal: 13, backgroundColor: theme.background }} />;",
    '<View className="flex-1 bg-background text-foreground border-border p-[13px] w-[37%] rounded-[11px] text-[17px]" />;',
    '<View className="bg-[var(--background)] text-[length:17px] shadow-[0_2px_8px_var(--shadow)]" />;',
    '<View className="bg-transparent border-current" />;',
    "<Icon color={theme.foreground} />;",
    '<View style={{ backgroundColor: "transparent", color: "currentColor" }} />;',
    '<View style={{ width: "50%", transform: [{ rotate: "45deg" }] }} />;',
    'const styles = { backgroundColor: dynamicColor, borderColor: PlatformColor("separator") };',
    'const css = "--background: var(--color-background)";',
    'const section = "#inbox";',
  ],
  invalid: [
    ...[
      'const styles = StyleSheet.create({ row: { backgroundColor: "#fff" } });',
      'const styles = { ["color"]: "red" };',
      "const styles = { color: 0xffaabbcc };",
      '<Icon color="#222" />;',
      '<TextInput placeholderTextColor={"rgb(2, 3, 4)"} />;',
      '<View style={{ borderColor: dark ? "black" : theme.border }} />;',
      '<View style={{ shadowColor: "rgba(0,0,0,.1)" }} />;',
      '<View className="dark:bg-slate-900/50" />;',
      '<View className={cn("p-4", active && "text-red-500")} />;',
      '<View className={cn({ "border-[#fff]": active })} />;',
      '<View className={`p-4 bg-blue-500 ${active ? "opacity-50" : ""}`} />;',
      '<View className="bg-[oklch(0.5_0.2_20)]" />;',
      '<View className="border-white/20" />;',
      'const adHocPalette = { surface: "#ffffff" };',
      "const accent = `#aabbcc`;",
      'const accent = "oklch(0.5 0.2 20)";',
      "const styles = { color: `#fff` };",
      '<View className="bg-[#fff]/50" />;',
      '<View className="shadow-[0_2px_8px_#0003]" />;',
      '<View className="text-[color:rebeccapurple]" />;',
    ].map((code) => ({ code, errors: [{ messageId: "color" }] })),
  ],
});
