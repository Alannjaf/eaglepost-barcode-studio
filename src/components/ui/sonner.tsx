import { Toaster as Sonner, toast } from "sonner"
import { useSettingsStore } from "@/store/useSettingsStore"

type ToasterProps = React.ComponentProps<typeof Sonner>

// NOTE: this app manages theme via useSettingsStore (+ manual .dark class), NOT next-themes.
// Using next-themes' useTheme here throws "Invalid hook call" (no ThemeProvider), so read our store.
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useSettingsStore((state) => state.theme)

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
