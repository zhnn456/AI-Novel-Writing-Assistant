import jingxiLogoUrl from "@/assets/jingxi-logo.png";
import { cn } from "@/lib/utils";

interface DesktopBrandMarkProps {
  className?: string;
}

export default function DesktopBrandMark({ className }: DesktopBrandMarkProps) {
  return (
    <img
      src={jingxiLogoUrl}
      alt="鲸喜AI写作"
      className={cn("h-8 w-8 shrink-0 object-contain", className)}
    />
  );
}
