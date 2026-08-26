import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/components/theme/ThemeProvider";
import { Button } from "@/components/ui/button";
import { strings } from "@/strings";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: strings.theme.light, Icon: Sun },
  { value: "dark", label: strings.theme.dark, Icon: Moon },
  { value: "system", label: strings.theme.system, Icon: Monitor },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center rounded-md border border-border p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          variant={theme === value ? "default" : "ghost"}
          size="icon"
          aria-label={label}
          aria-pressed={theme === value}
          title={label}
          onClick={() => setTheme(value)}
          className={theme === value ? "h-7 w-7 rounded" : "h-7 w-7 rounded text-muted-foreground"}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}
