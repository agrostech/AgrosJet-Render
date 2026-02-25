import { cn } from "@/lib/utils";

const LOADING_ICON = "https://customer-assets.emergentagent.com/job_37e208cc-89bc-4008-aaad-b9cb8d4fb4af/artifacts/sw3wm7kn_Ads%C4%B1z%20tasar%C4%B1m%20%286%29.png";

export function LoadingSpinner({ className, size = "default", text }) {
  const sizeClasses = {
    sm: "w-8 h-8",
    default: "w-12 h-12",
    lg: "w-16 h-16",
    xl: "w-20 h-20"
  };

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <div className={cn("relative", sizeClasses[size])}>
        <img 
          src={LOADING_ICON} 
          alt="Yükleniyor" 
          className={cn(
            "w-full h-full object-contain animate-pulse",
            sizeClasses[size]
          )}
          style={{ filter: "invert(1) brightness(0.4) sepia(1) hue-rotate(180deg) saturate(5)" }}
        />
      </div>
      {text && (
        <p className="mt-3 text-sm text-muted-foreground animate-pulse">{text}</p>
      )}
    </div>
  );
}

// Full page loading overlay
export function PageLoading({ text = "Yükleniyor..." }) {
  return (
    <div className="flex items-center justify-center min-h-[50vh] md:min-h-[60vh]">
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}

// Inline/compact loading for buttons or small areas
export function InlineLoading({ className }) {
  return (
    <img 
      src={LOADING_ICON} 
      alt="Yükleniyor" 
      className={cn("w-4 h-4 animate-pulse inline-block", className)}
      style={{ filter: "invert(1) brightness(0.4) sepia(1) hue-rotate(180deg) saturate(5)" }}
    />
  );
}

export default LoadingSpinner;
